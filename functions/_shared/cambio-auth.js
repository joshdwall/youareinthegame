export function corsHeaders(extra = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra
  };
}

export function hasAccessAssertion(request) {
  const jwt = request.headers.get('cf-access-jwt-assertion');
  const email = request.headers.get('cf-access-authenticated-user-email');
  return Boolean(jwt || email);
}

export function allowUnauthedHost(url) {
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

export function requireAccess(request, url) {
  if (allowUnauthedHost(url) || hasAccessAssertion(request)) return null;
  return new Response(JSON.stringify({ ok: false, error: 'access_required' }), {
    status: 401,
    headers: corsHeaders()
  });
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(headers)
  });
}
