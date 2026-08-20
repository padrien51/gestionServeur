const test = async () => {
    // Probe lscr.io pour obtenir le vrai endpoint d'auth via WWW-Authenticate
    const probeRes = await fetch('https://lscr.io/v2/linuxserver/duckdns/manifests/latest', {
        headers: { Accept: 'application/vnd.docker.distribution.manifest.list.v2+json' }
    });
    console.log('Probe status:', probeRes.status);
    const wwwAuth = probeRes.headers.get('www-authenticate');
    console.log('WWW-Authenticate:', wwwAuth);

    if (wwwAuth) {
        const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
        const serviceMatch = wwwAuth.match(/service="([^"]+)"/);
        if (realmMatch) {
            const realm = realmMatch[1];
            const service = serviceMatch ? serviceMatch[1] : '';
            const tokenUrl = `${realm}?service=${service}&scope=repository:linuxserver/duckdns:pull`;
            console.log('Real token URL:', tokenUrl);
            const authRes = await fetch(tokenUrl);
            console.log('Auth status:', authRes.status);
            if (authRes.ok) {
                const authData = await authRes.json();
                const token = authData.token || authData.access_token;
                console.log('Token obtained:', token ? `YES (len=${token.length})` : 'NO');

                const mRes = await fetch('https://lscr.io/v2/linuxserver/duckdns/manifests/latest', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json'
                    }
                });
                console.log('Manifest status:', mRes.status);
                const digest = mRes.headers.get('docker-content-digest');
                console.log('Remote digest:', digest ? digest.substring(0, 35) + '...' : 'NULL');
            }
        }
    }
};
test().catch(console.error);
