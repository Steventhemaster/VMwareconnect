// Server-side connectivity check; never import into src/ or a browser bundle.
import {pathToFileURL} from 'node:url';

export function probeRequest(env) {
  if (!env.DATALOY_BASE_URL) throw new Error('DATALOY_BASE_URL_REQUIRED');
  let base;
  try { base = new URL(env.DATALOY_BASE_URL); } catch { throw new Error('DATALOY_BASE_URL_INVALID'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('DATALOY_BASE_URL_MUST_BE_CLEAN_HTTPS');
  }
  if (!env.DATALOY_API_KEY) throw new Error('DATALOY_API_KEY_REQUIRED');
  const headers = {Accept: 'application/json'};
  if (env.DATALOY_AUTH_MODE === 'bearer') {
    headers.Authorization = `Bearer ${env.DATALOY_API_KEY}`;
  } else if (env.DATALOY_AUTH_MODE === 'api-key') {
    const header = env.DATALOY_API_KEY_HEADER;
    if (!header || !/^[A-Za-z][A-Za-z0-9-]*$/.test(header) || /^(host|cookie|authorization|accept|content-length|connection|proxy-.*)$/i.test(header)) {
      throw new Error('DATALOY_API_KEY_HEADER_REQUIRED_OR_INVALID');
    }
    headers[header] = env.DATALOY_API_KEY;
  } else {
    throw new Error('DATALOY_AUTH_MODE_UNCONFIRMED');
  }
  if (/[\r\n]/.test(env.DATALOY_API_KEY)) throw new Error('DATALOY_API_KEY_INVALID');
  // Base URL must include the tenant API root, normally /ws/rest.
  base.pathname = base.pathname.replace(/\/$/, '') + '/Currency';
  base.searchParams.set('filter', 'currencyCode(EQ)USD');
  return {url: base, options: {method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000)}};
}

export async function probe(env, fetchImpl = fetch) {
  if (env.DATALOY_AUTH_MODE === 'oauth2') {
    // Validate the API destination before sending credentials to the token service.
    probeRequest({...env,DATALOY_AUTH_MODE:'bearer',DATALOY_API_KEY:'validation-only'});
    const tokenResult = await oauthToken(env, fetchImpl);
    if (!tokenResult.ok) return tokenResult;
    return probe({...env,DATALOY_AUTH_MODE:'bearer',DATALOY_API_KEY:tokenResult.token},fetchImpl);
  }
  const {url, options} = probeRequest(env);
  let response;
  try { response = await fetchImpl(url, options); } catch { return {ok:false, code:'NETWORK_TIMEOUT_OR_REDIRECT'}; }
  // Never log headers, credentials, response bodies or upstream error messages.
  if (!response.ok) { await response.body?.cancel(); return {ok:false, code:'HTTP_ERROR', status:response.status}; }
  const type = response.headers.get('content-type') || '';
  if (!/application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(type)) {
    await response.body?.cancel(); return {ok:false, code:'EXPECTED_JSON', status:response.status};
  }
  let raw = ''; let bytes = 0; const decoder = new TextDecoder();
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 65536) return {ok:false, code:'RESPONSE_TOO_LARGE'};
      raw += decoder.decode(chunk,{stream:true});
    }
    raw += decoder.decode();
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return {ok:false, code:'UNEXPECTED_SCHEMA'};
    return {ok:true, code:'CONNECTIVITY_ONLY', status:response.status, records:data.length};
  } catch { return {ok:false, code:'INVALID_OR_INTERRUPTED_JSON'}; }
}

export async function oauthToken(env, fetchImpl = fetch) {
  if (!env.DATALOY_CLIENT_ID || !env.DATALOY_CLIENT_SECRET) throw new Error('DATALOY_OAUTH_CREDENTIALS_REQUIRED');
  // Destination verified against the existing dataloy-tool tenant configuration.
  if (env.DATALOY_TOKEN_URL !== 'https://dataloy.eu.auth0.com/oauth/token') throw new Error('DATALOY_TOKEN_URL_UNCONFIRMED');
  if (env.DATALOY_AUDIENCE !== 'https://dataloy') throw new Error('DATALOY_AUDIENCE_UNCONFIRMED');
  try {
    const r = await fetchImpl(env.DATALOY_TOKEN_URL,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({client_id:env.DATALOY_CLIENT_ID,client_secret:env.DATALOY_CLIENT_SECRET,audience:env.DATALOY_AUDIENCE,grant_type:'client_credentials'})
    });
    if (!r.ok) { await r.body?.cancel(); return {ok:false,code:'OAUTH_HTTP_ERROR',status:r.status}; }
    if (!(r.headers.get('content-type') || '').includes('application/json')) { await r.body?.cancel(); return {ok:false,code:'OAUTH_EXPECTED_JSON'}; }
    const chunks=[]; let size=0;
    for await(const chunk of r.body) {size+=chunk.byteLength;if(size>65536)return {ok:false,code:'OAUTH_RESPONSE_TOO_LARGE'};chunks.push(chunk);}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/.test(data.access_token) || data.token_type?.toLowerCase() !== 'bearer') return {ok:false,code:'OAUTH_INVALID_TOKEN_RESPONSE'};
    return {ok:true,token:data.access_token};
  } catch {return {ok:false,code:'OAUTH_NETWORK_OR_RESPONSE_ERROR'};}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try { result = await probe(process.env); }
  catch (error) { result = {ok:false, code: error.message.startsWith('DATALOY_') ? error.message : 'CONFIGURATION_ERROR'}; }
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
