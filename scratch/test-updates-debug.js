// Script de diagnostic pour comprendre pourquoi HA et Mealie ne remontent pas de MAJ
// Simule exactement ce que fait le backend

const semver = require('semver');

async function getRegistryAuthToken(registry, repo) {
    try {
        let authUrl = '';
        if (registry === 'registry-1.docker.io' || registry === 'docker.io' || registry === 'hub.docker.com') {
            authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;
        } else {
            authUrl = `https://${registry}/token?scope=repository:${repo}:pull`;
        }
        const authRes = await fetch(authUrl);
        if (authRes.ok) {
            const authData = await authRes.json();
            return authData.token || authData.access_token || '';
        }
    } catch (e) {}
    return '';
}

// Simule le parsing de l'image comme le fait le backend
function parseImage(rawImage) {
    let imageName = rawImage;
    let tag = 'latest';

    if (imageName.includes(':')) {
        const parts = imageName.split(':');
        imageName = parts[0];
        tag = parts[1];
    }
    if (imageName.includes('@')) {
        imageName = imageName.split('@')[0];
    }

    let registry = 'registry-1.docker.io';
    let repo = imageName;

    const imgParts = imageName.split('/');
    if (imgParts.length > 1 && imgParts[0].includes('.')) {
        registry = imgParts[0];
        repo = imgParts.slice(1).join('/');
    } else {
        if (!repo.includes('/')) {
            repo = `library/${repo}`;
        }
    }
    return { registry, repo, tag };
}

// Test avec différentes images problématiques et un digest local simulé
async function testImage(label, rawImage, fakeLocalDigest) {
    console.log(`\n\n====== TEST: ${label} (Image: ${rawImage}) ======`);
    const { registry, repo, tag } = parseImage(rawImage);
    console.log(`  → Registre parsé: ${registry}`);
    console.log(`  → Dépôt parsé:    ${repo}`);
    console.log(`  → Tag parsé:      ${tag}`);

    const token = await getRegistryAuthToken(registry, repo);
    console.log(`  → Token obtenu:   ${token ? 'OUI' : 'NON (public?)'}`);

    const headers = {
        Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (tag === 'latest' || tag === '') {
        const url = `https://${registry}/v2/${repo}/manifests/latest`;
        console.log(`  → Appel manifest: ${url}`);
        const res = await fetch(url, { headers });
        console.log(`  → Status HTTP:    ${res.status}`);
        if (res.ok) {
            const remoteDigest = res.headers.get('docker-content-digest');
            console.log(`  → Digest remote:  ${remoteDigest}`);
            if (fakeLocalDigest) {
                const hasUpdate = !fakeLocalDigest.includes(remoteDigest);
                console.log(`  → Digest local:   ${fakeLocalDigest}`);
                console.log(`  → MAJ détectée:   ${hasUpdate ? 'OUI ✅' : 'NON ❌ (déjà à jour)'}`);
            }
        } else {
            const body = await res.text();
            console.log(`  → Body d'erreur:  ${body.substring(0, 200)}`);
        }
    } else {
        console.log(`  → Mode SemVer pour tag fixe: ${tag}`);
        const cleanTag = semver.clean(tag) || semver.coerce(tag);
        console.log(`  → Tag coercé:     ${cleanTag}`);
        if (!cleanTag) {
            console.log(`  → ⚠️  PROBLÈME: semver ne peut pas parser '${tag}' → la comparaison est IMPOSSIBLE`);
            return;
        }
        const url = `https://${registry}/v2/${repo}/tags/list`;
        console.log(`  → Appel tags:     ${url}`);
        const res = await fetch(url, { headers });
        console.log(`  → Status HTTP:    ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            const tagCount = data.tags ? data.tags.length : 0;
            console.log(`  → Nb tags trouvés: ${tagCount}`);
            if (data.tags && data.tags.length > 0) {
                console.log(`  → 5 premiers tags: ${data.tags.slice(0, 5).join(', ')}`);
                let highestVersion = cleanTag;
                let foundNewer = false;
                for (const t of data.tags) {
                    const parsed = semver.clean(t) || semver.coerce(t);
                    if (parsed && semver.gt(parsed, highestVersion)) {
                        highestVersion = parsed;
                        foundNewer = true;
                    }
                }
                console.log(`  → Version max trouvée: ${highestVersion}`);
                console.log(`  → MAJ détectée: ${foundNewer ? 'OUI ✅' : 'NON ❌ (déjà à jour?)'}`);
            }
        } else {
            const body = await res.text();
            console.log(`  → Body d'erreur: ${body.substring(0, 300)}`);
        }
    }
}

async function main() {
    // Home Assistant - souvent sur ghcr.io, avec des tags comme "2024.8.0"
    await testImage('Home Assistant', 'ghcr.io/home-assistant/home-assistant:2024.6.0', null);
    
    // Mealie - souvent sur ghcr.io avec tag 'latest' ou version fixe
    await testImage('Mealie (latest)', 'ghcr.io/mealie-recipes/mealie:latest', 'sha256:FAKEDIGESTXXXXXXXXXXXXXXXX');
    await testImage('Mealie (version fixe)', 'ghcr.io/mealie-recipes/mealie:v1.9.0', null);
    
    // Docker Hub standard (contrôle)
    await testImage('Nginx (contrôle)', 'nginx:latest', 'sha256:FAKEDIGESTXXXXXXXXXXXXXXXX');
}

main().catch(console.error);
