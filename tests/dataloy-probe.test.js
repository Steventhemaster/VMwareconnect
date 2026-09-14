import test from 'node:test';
import assert from 'node:assert/strict';
import {probe, probeRequest} from '../scripts/dataloy-probe.mjs';
const config = {DATALOY_BASE_URL:'https://tenant.example/ws/rest',DATALOY_AUTH_MODE:'bearer',DATALOY_API_KEY:'test-only-token'};
test('probe requires explicit HTTPS destination and confirmed authentication',()=>{
  for (const url of ['http://tenant.example','https://user:password@tenant.example','https://tenant.example?secret=x']) {
    assert.throws(()=>probeRequest({...config,DATALOY_BASE_URL:url}));
  }
  assert.throws(()=>probeRequest({...config,DATALOY_AUTH_MODE:''}));
  assert.throws(()=>probeRequest({...config,DATALOY_API_KEY:'bad\nvalue'}));
});
test('probe only reads filtered Currency and never follows redirects',async()=>{
  const result = await probe(config,async(url,options)=>{
    assert.equal(url.pathname,'/ws/rest/Currency');
    assert.equal(url.searchParams.get('filter'),'currencyCode(EQ)USD');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    return new Response('[{"currencyCode":"USD"}]',{headers:{'content-type':'application/json'}});
  });
  assert.deepEqual(result,{ok:true,code:'CONNECTIVITY_ONLY',status:200,records:1});
});
test('probe does not reveal response bodies and rejects login HTML',async()=>{
  const denied=await probe(config,async()=>new Response('secret-echo',{status:401}));
  assert.deepEqual(denied,{ok:false,code:'HTTP_ERROR',status:401});
  const html=await probe(config,async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}}));
  assert.equal(html.code,'EXPECTED_JSON');
});
test('probe refuses oversized JSON and unconfirmed API key headers',async()=>{
  assert.throws(()=>probeRequest({...config,DATALOY_AUTH_MODE:'api-key',DATALOY_API_KEY_HEADER:'Host'}));
  const large=await probe(config,async()=>new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}}));
  assert.equal(large.code,'RESPONSE_TOO_LARGE');
});
const oauth = {...config,DATALOY_AUTH_MODE:'oauth2',DATALOY_CLIENT_ID:'test-client',DATALOY_CLIENT_SECRET:'test-secret',DATALOY_TOKEN_URL:'https://dataloy.eu.auth0.com/oauth/token',DATALOY_AUDIENCE:'https://dataloy'};
test('OAuth exchanges credentials only at the confirmed endpoint and exposes no token',async()=>{
  const calls=[];
  const result=await probe(oauth,async(url,options)=>{
    calls.push(String(url));
    if(options.method==='POST') {
      assert.equal(options.redirect,'error');
      assert.equal(JSON.parse(options.body).grant_type,'client_credentials');
      return new Response(JSON.stringify({access_token:'test-bearer',token_type:'Bearer'}),{headers:{'content-type':'application/json'}});
    }
    assert.equal(options.headers.Authorization,'Bearer test-bearer');
    return new Response('[]',{headers:{'content-type':'application/json'}});
  });
  assert.equal(calls.length,2);
  assert.equal(result.ok,true);
  assert.equal(JSON.stringify(result).includes('test-bearer'),false);
});
test('OAuth fails closed for missing credentials and arbitrary token destinations',async()=>{
  let calls=0;const noNetwork=()=>{calls++;throw new Error('unexpected network');};
  await assert.rejects(probe({...oauth,DATALOY_CLIENT_SECRET:''},noNetwork));
  await assert.rejects(probe({...oauth,DATALOY_TOKEN_URL:'https://untrusted.example/token'},noNetwork));
  assert.equal(calls,0);
});
