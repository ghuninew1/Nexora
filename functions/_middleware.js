const htmlContentType = /^text\/html\b/i;

export function createPageNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
}

export function createPageContentSecurityPolicy(nonce) {
    return `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-src blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}

export async function onRequest({ request, next }) {
    const response = await next();
    const contentType = response.headers.get('Content-Type') || '';

    if (!['GET', 'HEAD'].includes(request.method) || !htmlContentType.test(contentType) || response.status === 304) {
        return response;
    }

    const headers = new Headers(response.headers);
    const nonce = createPageNonce();
    headers.set('Content-Security-Policy', createPageContentSecurityPolicy(nonce));
    headers.set('Strict-Transport-Security', 'max-age=31536000');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('Cache-Control', 'no-store');
    headers.delete('ETag');

    if (new URL(request.url).pathname.startsWith('/s/')) {
        headers.set('Referrer-Policy', 'no-referrer');
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
