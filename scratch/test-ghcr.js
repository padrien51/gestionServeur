const fs = require('fs');

async function getRemoteDigest(imageName, tag) {
    let registry = 'registry-1.docker.io';
    let repo = imageName;

    const parts = imageName.split('/');
    if (parts.length > 1 && parts[0].includes('.')) {
        registry = parts[0];
        repo = parts.slice(1).join('/');
    } else {
        if (!repo.includes('/')) {
            repo = `library/${repo}`;
        }
    }

    let token = '';
    try {
        let authUrl = '';
        if (registry === 'registry-1.docker.io') {
            authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;
        } else {
            authUrl = `https://${registry}/token?scope=repository:${repo}:pull`;
        }
        
        console.log("Auth URL:", authUrl);
        const authRes = await fetch(authUrl);
        if (authRes.ok) {
            const authData = await authRes.json();
            token = authData.token || authData.access_token;
            console.log("Got token.");
        } else {
            console.log("Auth failed, status:", authRes.status);
        }
    } catch (e) {
        console.log("Auth error:", e);
    }

    const manifestUrl = `https://${registry}/v2/${repo}/manifests/${tag}`;
    console.log("Manifest URL:", manifestUrl);
    const headers = {
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const manifestRes = await fetch(manifestUrl, { headers });
    console.log("Manifest Status:", manifestRes.status);
    if (manifestRes.ok) {
        const digest = manifestRes.headers.get('docker-content-digest');
        console.log("Digest:", digest);
        return digest;
    }
    return null;
}

getRemoteDigest('ghcr.io/immich-app/immich-server', 'release');
getRemoteDigest('nginx', 'latest');
