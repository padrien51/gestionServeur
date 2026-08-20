// Script de validation pour confirmer les corrections
const semver = require('semver');

const PRERELEASE_KEYWORDS = /rc|beta|alpha|dev|nightly|edge|unstable|canary|preview/i;
function isStableTag(tag) { return !PRERELEASE_KEYWORDS.test(tag); }

async function getRegistryAuthToken(registry, repo) {
    try {
        let authUrl = registry === 'registry-1.docker.io'
            ? `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`
            : `https://${registry}/token?scope=repository:${repo}:pull`;
        const authRes = await fetch(authUrl);
        if (authRes.ok) {
            const authData = await authRes.json();
            return authData.token || authData.access_token || '';
        }
    } catch (e) {}
    return '';
}

async function getAllTagsPaginated(registry, repo, headers) {
    const allTags = [];
    let url = `https://${registry}/v2/${repo}/tags/list?n=100`;
    let pageCount = 0;
    const MAX_PAGES = 10;
    while (url && pageCount < MAX_PAGES) {
        const res = await fetch(url, { headers });
        if (!res.ok) break;
        const data = await res.json();
        if (data.tags) allTags.push(...data.tags);
        const linkHeader = res.headers.get('link');
        url = null;
        if (linkHeader) {
            const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (match) {
                const next = match[1];
                url = next.startsWith('http') ? next : `https://${registry}${next}`;
            }
        }
        pageCount++;
    }
    console.log(`  → Pages parcourues: ${pageCount}, Total tags: ${allTags.length}`);
    return allTags;
}

async function testVersionedTag(label, registry, repo, tag) {
    console.log(`\n====== TEST: ${label} (tag: ${tag}) ======`);
    const token = await getRegistryAuthToken(registry, repo);
    const headers = {
        Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const currentClean = semver.clean(tag) || semver.coerce(tag);
    console.log(`  → Version actuelle parsée: ${currentClean}`);

    const allTags = await getAllTagsPaginated(registry, repo, headers);

    let highestVersion = currentClean;
    let foundNewer = false;

    for (const t of allTags) {
        if (!isStableTag(t)) continue;
        const parsed = semver.clean(t) || semver.coerce(t);
        if (!parsed) continue;
        const originalNumbers = t.replace(/^v/, '').split(/[^0-9.]/)[0];
        const parsedStr = parsed.toString();
        if (!parsedStr.startsWith(originalNumbers.split('.')[0])) continue;
        if (semver.gt(parsed, highestVersion)) {
            highestVersion = parsed;
            foundNewer = true;
        }
    }

    console.log(`  → Version max stable trouvée: ${highestVersion}`);
    console.log(`  → MAJ détectée: ${foundNewer ? 'OUI ✅' : 'NON ❌ (déjà à jour)'}`);
}

async function main() {
    // HA avec tag versionné (2024.6.0 devrait trouver 2024.7.x ou 2024.8.x)
    await testVersionedTag('Home Assistant', 'ghcr.io', 'home-assistant/home-assistant', '2024.6.0');
    
    // Mealie avec tag versionné
    await testVersionedTag('Mealie v1.9.0', 'ghcr.io', 'mealie-recipes/mealie', 'v1.9.0');
}

main().catch(console.error);
