import { writeFile } from 'node:fs/promises'
import { expect, test as base } from '@playwright/test'
const ok = (data) => ({ data, message: 'ok', error: null })
const bad = (status) => ({ data: null, message: null, error: { code: ({400:'VALIDATION_FAILED',401:'UNAUTHORIZED',403:'FORBIDDEN',503:'SERVICE_UNAVAILABLE'})[status], message: 'fixture rejection' } })
const account = (id) => ({ id, name: id === 'member' ? '설정 회원' : '다른 회원', role: 'USER', stamps: 0 })
const product = { id:7,name:'설정 표본',type:'탁주',price:0,abv:0,img:null,orderCount:0 }
const empty = (items=[]) => ({items,page:1,size:12,total:items.length,totalPages:items.length?1:0,hasNext:false})
const test=base.extend({ settingsApi:[async({page},use)=>{
 const state={ user:account('member'), names:{member:'설정 회원',other:'다른 회원'}, passwords:{member:'old pass',other:'other pass'}, calls:[], errors:[], unexpected:[], writeStatus:0, meFailures:0 }
 page.on('pageerror',(e)=>state.errors.push(e.message))
 await page.route('**/api/**',async(route)=>{
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/users/me/cart') return route.fulfill({ status: 404, json: { data: null, error: { code: 'CART_NOT_SUPPORTED' } } })
  const r=route.request(),path=new URL(r.url()).pathname,method=r.method(),body=r.postData()?r.postDataJSON():undefined
  state.calls.push({path,method,body})
  const reply=(data,status=200)=>route.fulfill({status,json:status<400?ok(data):bad(status)})
  if(path==='/api/auth/me') {if(state.meFailures){state.meFailures--;return reply(null,503)};return reply(state.user?{...state.user,name:state.names[state.user.id]}:null,state.user?200:401)}
  if(path==='/api/auth/logout'){state.user=null;return reply(null)}
  if(path==='/api/auth/login'){state.user=account(body.id);return reply({...state.user,name:state.names[body.id]})}
  if(['/api/users/me/profile','/api/users/me/password'].includes(path)&&method==='PUT'){
   if(!state.user)return reply(null,401)
   if(state.writeStatus)return reply(null,state.writeStatus)
   if(path.endsWith('/profile'))state.names[state.user.id]=body.name
   else {if(body.currentPassword!==state.passwords[state.user.id])return reply(null,403);state.passwords[state.user.id]=body.newPassword}
   return reply(true)
  }
  if(/^\/api\/users\/[^/]+\/profile$/.test(path))return reply({user:{...state.user,name:state.names[state.user.id]},grade:{title:'씨앗',step:0,stepMax:10,to:10}})
  if(/^\/api\/users\/[^/]+\/orders$/.test(path))return reply(empty())
  if(path==='/api/products/popular')return reply([product])
  if(path==='/api/products')return reply(empty([product]))
  if(path==='/api/markets')return reply(empty())
  if(path==='/api/products/7')return reply(product)
  if(path==='/api/products/7/features')return reply({productId:7,volumeMl:null,description:null,tasteTags:null,aromaTags:null,sourceName:null,sourceUrl:null,sourceNote:null})
  if(path==='/api/products/7/comments')return reply(empty())
  if(path==='/api/products/7/similar'&&method==='GET')return reply({items:[]})
  if(path==='/api/users/me/favorites/7')return reply({productId:7,favorited:false})
  state.unexpected.push(`${method} ${path}`);return reply(null,503)
 })
 await use(state);expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([])
},{auto:true}]})
const writes=(s)=>s.calls.filter((c)=>c.method==='PUT')
async function ready(page,path='/settings'){await page.goto(path);await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled()}
async function passwords(page,current='old pass',next=' new pass '){await page.getByLabel('현재 비밀번호',{exact:true}).fill(current);await page.getByLabel('새 비밀번호',{exact:true}).fill(next);await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(next)}
async function nav(page,name){const link=page.getByRole('link',{name,exact:true});if(!await link.isVisible())await page.getByRole('button',{name:'메뉴 열기',exact:true}).click();await link.click()}
async function login(page,id){await nav(page,'로그인');await page.getByLabel('아이디',{exact:true}).fill(id);await page.getByLabel('비밀번호',{exact:true}).fill('fixture pass');await page.locator('.auth-form').getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('link',{name:'내 계정 설정',exact:true}).click();await expect(page).toHaveURL(/\/settings$/)}
function gate(){let release;const promise=new Promise((r)=>{release=r});return{promise,release}}

test('마이에서 본인 설정 진입·이름만 저장하고 현재 세션/프로필을 재조회; 취향은 기존 경로',async({page,settingsApi:s})=>{
 await page.goto('/profile');await page.getByRole('link',{name:'내 계정 설정',exact:true}).click();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('설정 회원')
 await page.getByLabel('이름',{exact:true}).fill(' 새 이름 ');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.locator('.user-name')).toHaveText(' 새 이름 님');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled()
 expect(writes(s).map((c)=>c.body)).toEqual([{name:' 새 이름 '}]);await expect(page.getByRole('link',{name:'내 취향 설정',exact:true})).toHaveAttribute('href','/preferences')
 await page.getByRole('link',{name:'마이페이지',exact:true}).click();await expect(page.getByRole('heading',{name:'새 이름 님의 취향 기록',exact:true})).toBeVisible()
})
test('현재 암호403은 세션 유지·입력 즉시삭제·명시 재입력; literal 새 암호를 변형하지 않음',async({page,settingsApi:s})=>{
 await ready(page);await passwords(page,'wrong pass');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.getByRole('alert')).toContainText('현재 비밀번호가 일치하지 않습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('현재 비밀번호',{exact:true})).toHaveValue('')
 await passwords(page);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.locator('.settings-view .notice.success')).toContainText('비밀번호가 변경되었습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();expect(s.passwords.member).toBe(' new pass ')
 expect(writes(s).at(-1).body).toEqual({currentPassword:'old pass',newPassword:' new pass '});await expect(page.locator('.user-name')).toHaveText('설정 회원님')
})
test('기존1자 암호 허용·새 암호확인 불일치/공백 이름은 무전송과 명확한 포커스',async({page,settingsApi:s})=>{
 s.passwords.member='a';await ready(page);await passwords(page,'a','abcd');await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('other');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.getByLabel('새 비밀번호 확인',{exact:true})).toBeFocused();expect(writes(s)).toEqual([])
 await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('abcd');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.locator('.settings-view .notice.success')).toContainText('비밀번호가 변경되었습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled()
 await page.getByLabel('이름',{exact:true}).fill(' 　');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.getByLabel('이름',{exact:true})).toBeFocused();expect(writes(s)).toHaveLength(1)
})
test('이름 저장 중 다음 초안·단일 제출은 늦은 승인 후 보존',async({page,settingsApi:s})=>{
 const g=gate();let started=false;await page.route('**/api/users/me/profile',async(r)=>{started=true;await g.promise;await r.fallback()})
 try{await ready(page);await page.getByLabel('이름',{exact:true}).fill('제출 이름');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect.poll(()=>started).toBe(true);await page.getByLabel('이름',{exact:true}).fill('다음 이름');await page.getByLabel('이름',{exact:true}).press('Enter');g.release();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('다음 이름');expect(writes(s)).toHaveLength(1);expect(s.names.member).toBe('제출 이름')}finally{g.release()}
})
test('암호 저장 중 새 비밀초안은 옛 성공 정리에 사라지지 않으며 디스크에 기록하지 않음',async({page})=>{
 const g=gate();let started=false;await page.route('**/api/users/me/password',async(r)=>{started=true;await g.promise;await r.fallback()})
 try{await ready(page);await passwords(page);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect.poll(()=>started).toBe(true);await expect(page.getByLabel('현재 비밀번호',{exact:true})).toHaveValue('');await passwords(page,'next current','next draft');g.release();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('새 비밀번호',{exact:true})).toHaveValue('next draft');expect(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]))).not.toContain('next draft')}finally{g.release()}
})
for(const kind of ['profile','password'])test(`${kind} 불확실503은 자동 재전송/권위없는 재활성화 없이 명시 상태 확인`,async({page,settingsApi:s})=>{
 await ready(page);s.writeStatus=503;await page.getByLabel('이름',{exact:true}).fill('보존 이름');if(kind==='password')await passwords(page)
 const count=s.calls.filter((c)=>c.path==='/api/auth/me').length
 await page.getByRole('button',{name:kind==='profile'?'이름 저장':'비밀번호 변경',exact:true}).click();await expect(page.getByRole('alert')).toContainText('변경 결과를 확인하지 못했습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeDisabled();expect(writes(s)).toHaveLength(1);expect(s.calls.filter((c)=>c.path==='/api/auth/me')).toHaveLength(count)
 s.writeStatus=0;await page.getByRole('button',{name:'현재 상태 다시 확인',exact:true}).click();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('보존 이름');expect(writes(s)).toHaveLength(1)
})
test('이름 승인 뒤 me503은 저장완료를 보존하고 읽기만 재시도',async({page,settingsApi:s})=>{
 await ready(page);s.meFailures=1;await page.getByLabel('이름',{exact:true}).fill('승인된 이름');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.locator('.settings-view .notice.success')).toContainText('변경은 저장되었습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeDisabled();await page.getByRole('button',{name:'현재 상태 다시 확인',exact:true}).click();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();expect(writes(s)).toHaveLength(1)
})
test('현재401은 수정폼 차폐·명시 로그인·원래query와 장바구니 보존',async({page,settingsApi:s})=>{
 await page.addInitScript((p)=>localStorage.setItem('pubburi-cart',JSON.stringify([{product:p,quantity:2}])),product);await ready(page,'/settings?origin=profile');s.writeStatus=401
 await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.getByRole('heading',{name:'다시 로그인해 주세요',exact:true})).toBeVisible();await expect(page.getByRole('form',{name:'본인 비밀번호 변경'})).toHaveCount(0);await page.getByRole('button',{name:'다시 로그인',exact:true}).click();await expect(page).toHaveURL((u)=>u.pathname==='/account'&&u.searchParams.get('redirect')==='/settings?origin=profile');expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('pubburi-cart')))[0].quantity).toBe(2)
})
test('초기 재확인 보류/503은 이름을 만들지 않고 읽기 복구; 비회원은 목적지로 로그인',async({page,settingsApi:s})=>{
 const g=gate();let count=0,started=false;await page.route('**/api/auth/me',async(r)=>{if(++count===2){started=true;await g.promise};await r.fallback()})
 try{await page.goto('/settings');await expect.poll(()=>started).toBe(true);await expect(page.getByLabel('이름',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeDisabled();s.meFailures=1;g.release();await expect(page.getByRole('alert')).toContainText('현재 로그인 상태를 확인하지 못했습니다.');await page.getByRole('button',{name:'현재 상태 다시 확인',exact:true}).click();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('설정 회원')}finally{g.release()}
 s.user=null;await page.reload();await expect(page).toHaveURL((u)=>u.pathname==='/account'&&u.searchParams.get('redirect')==='/settings')
})
test('새 경로 진입은 기존 확인을 재사용하지 않고 실제 만료를 확인',async({page,settingsApi:s})=>{
 await ready(page);await page.getByRole('link',{name:'마이페이지',exact:true}).click();await expect(page.getByRole('heading',{name:'설정 회원님의 취향 기록',exact:true})).toBeVisible();s.user=null;await page.goBack();await expect(page).toHaveURL((u)=>u.pathname==='/account'&&u.searchParams.get('redirect')==='/settings')
})
test('늦은 옛 계정 승인/401은 다른 계정 설정/현재 경로/알림을 덮지 않음',async({page,settingsApi:s})=>{
 const g=gate();let started=false;await page.route('**/api/users/me/profile',async(r)=>{started=true;await g.promise;await r.fulfill({status:401,json:bad(401)})})
 try{await ready(page);await page.getByLabel('이름',{exact:true}).fill('옛 이름');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect.poll(()=>started).toBe(true);await nav(page,'홈');await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('.user-name')).toHaveCount(0);await login(page,'other');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();const settled=page.waitForResponse((r)=>new URL(r.url()).pathname==='/api/users/me/profile'&&r.request().method()==='PUT');g.release();await (await settled).finished();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('다른 회원');await expect(page).toHaveURL(/\/settings$/);await expect(page.getByRole('heading',{name:'다시 로그인해 주세요',exact:true})).toHaveCount(0)}finally{g.release()}
})
test('같은 계정 재로그인도 이전 HTTP 정착 뒤 새 me로 편집하고 초기 캐시를 신뢰하지 않음',async({page,settingsApi:s})=>{
 const g=gate();let started=false;await page.route('**/api/users/me/profile',async(r)=>{started=true;await g.promise;s.names.member='이전 요청 저장';await r.fulfill({json:ok(true)})})
 try{await ready(page);await page.getByLabel('이름',{exact:true}).fill('이전 요청 저장');await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect.poll(()=>started).toBe(true);await nav(page,'홈');await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('.user-name')).toHaveCount(0);await login(page,'member');await expect(page.getByText('진행 중인 계정 변경을 기다리는 중입니다.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeDisabled();g.release();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('이름',{exact:true})).toHaveValue('이전 요청 저장')}finally{g.release()}
})
test('390px 라벨·autocomplete·키보드 저장과 이탈 비밀입력 정리·F05/cart/F06 보존',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript((p)=>localStorage.setItem('pubburi-cart',JSON.stringify([{product:p,quantity:2}])),product)
 await ready(page);await expect(page.getByLabel('현재 비밀번호',{exact:true})).toHaveAttribute('autocomplete','current-password');await expect(page.getByLabel('새 비밀번호',{exact:true})).toHaveAttribute('autocomplete','new-password')
 await page.getByLabel('이름',{exact:true}).fill('좁은 웹 이름');await page.getByLabel('이름',{exact:true}).press('Tab');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('.settings-view .notice.success')).toContainText('이름이 저장되었습니다.');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await passwords(page)
 await nav(page,'전체 주류');await expect(page.getByRole('heading',{name:'전체 주류 둘러보기',exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.getByLabel('새 비밀번호',{exact:true})).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('pubburi-cart')))[0].quantity).toBe(2)
 await test.info().attach('settings390',{body:await page.screenshot({fullPage:true}),contentType:'image/png'})
})

test('직접 query는 계정 선택에 쓰지 않고400 거절 뒤 현재 초안과 명시 제출을 유지',async({page,settingsApi:s})=>{
 await ready(page,'/settings?id=other&role=ADMIN');await page.getByLabel('이름',{exact:true}).fill('보존된 이름');s.writeStatus=400
 await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('입력한 내용을 서버에서 확인하지 못했습니다.');await expect(page.getByLabel('이름',{exact:true})).toHaveValue('보존된 이름');await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();expect(writes(s).map((c)=>({path:c.path,body:c.body}))).toEqual([{path:'/api/users/me/profile',body:{name:'보존된 이름'}}]);expect(s.names.other).toBe('다른 회원')
 s.writeStatus=0;await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.locator('.settings-view .notice.success')).toContainText('이름이 저장되었습니다.');expect(writes(s)).toHaveLength(2)
})
test('암호 불확실 응답 뒤 F05는 실제 새me 확인 전 새 상세를 기록하지 않음',async({page,settingsApi:s})=>{
 await ready(page);s.writeStatus=503;await passwords(page);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.getByRole('alert')).toContainText('변경 결과를 확인하지 못했습니다.')
 await nav(page,'전체 주류');await page.locator('.product-card').getByRole('link',{name:'상세 보기',exact:true}).click();await expect(page.getByRole('heading',{name:'설정 표본',exact:true})).toBeVisible();await nav(page,'최근 본 상품');await expect(page.getByRole('heading',{name:'최근 본 상품이 없습니다',exact:true})).toBeVisible();expect(writes(s)).toHaveLength(1)
})

test('새 암호의 실제 UTF8 72B 경계는 잘라보내지 않고 오류입력으로 초점; 기존 긴 현재암호는 그대로',async({page,settingsApi:s})=>{
 s.passwords.member='한'.repeat(30);await ready(page);await passwords(page,s.passwords.member,'😀'.repeat(19));await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.getByLabel('새 비밀번호',{exact:true})).toBeFocused();await expect(page.getByRole('alert')).toContainText('UTF-8 최대72바이트');await expect(page.getByLabel('새 비밀번호',{exact:true})).toHaveValue('😀'.repeat(19));expect(writes(s)).toHaveLength(0)
 await page.getByLabel('새 비밀번호',{exact:true}).fill('😀'.repeat(18));await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('😀'.repeat(18));await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect(page.locator('.settings-view .notice.success')).toContainText('비밀번호가 변경되었습니다.');expect(writes(s)[0].body).toEqual({currentPassword:'한'.repeat(30),newPassword:'😀'.repeat(18)})
})

test('화면 이탈 뒤 늦은 암호 승인도 현재 경로·초점을 탈취하거나 옛 알림을 만들지 않음',async({page,settingsApi:s})=>{
 const g=gate();let started=false;await page.route('**/api/users/me/password',async(r)=>{started=true;await g.promise;s.passwords.member=r.request().postDataJSON().newPassword;await r.fulfill({json:ok(true)})})
 try{await ready(page);await passwords(page);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await expect.poll(()=>started).toBe(true);await nav(page,'전체 주류');await expect(page.getByRole('heading',{name:'전체 주류 둘러보기',exact:true})).toBeVisible();await page.getByLabel('상품 검색',{exact:true}).focus();const settled=page.waitForResponse((r)=>new URL(r.url()).pathname==='/api/users/me/password');g.release();await (await settled).finished();await expect(page).toHaveURL(/\/products$/);await expect(page.getByLabel('상품 검색',{exact:true})).toBeFocused();await expect(page.locator('.settings-view')).toHaveCount(0);await expect(page.getByText('비밀번호가 변경되었습니다.',{exact:false})).toHaveCount(0)}finally{g.release()}
})

test('허용100자 이름을 저장해도390px 메뉴와 마이페이지의 원문/너비를 보존',async({page})=>{
 await page.setViewportSize({width:390,height:844});await ready(page);const name='N'.repeat(100);await page.getByLabel('이름',{exact:true}).fill(name);await page.getByRole('button',{name:'이름 저장',exact:true}).click();await expect(page.getByRole('button',{name:'이름 저장',exact:true})).toBeEnabled();await expect(page.locator('.user-name')).toHaveText(`${name}님`)
 await page.getByRole('button',{name:'메뉴 열기',exact:true}).click();const menuWidth=await page.evaluate(()=>document.documentElement.scrollWidth);const menu=await page.locator('.user-name').evaluate((node)=>{const range=document.createRange();range.selectNodeContents(node);return{text:node.textContent,box:node.getBoundingClientRect().toJSON(),fragments:[...range.getClientRects()].map((r)=>r.toJSON())}});await page.getByRole('link',{name:'마이',exact:true}).click();await expect(page.getByRole('heading',{name:`${name}님의 취향 기록`,exact:true})).toBeVisible();const profileWidth=await page.evaluate(()=>document.documentElement.scrollWidth);const profile=await page.locator('.profile-hero h1').evaluate((node)=>{const range=document.createRange();range.selectNodeContents(node);return{text:node.textContent,box:node.getBoundingClientRect().toJSON(),fragments:[...range.getClientRects()].map((r)=>r.toJSON())}})
 const geometryFile=test.info().outputPath('allowed-name-width.json');await writeFile(geometryFile,JSON.stringify({viewport:390,menuWidth,profileWidth,menu,profile}));await test.info().attach('allowed-name-width',{path:geometryFile,contentType:'application/json'});expect(menu.text).toBe(`${name}님`);expect(profile.text).toBe(`${name}님의 취향 기록`);expect({menuWidth,profileWidth}).toEqual({menuWidth:390,profileWidth:390});for(const range of [...menu.fragments,...profile.fragments]){expect(range.x).toBeGreaterThanOrEqual(0);expect(range.right).toBeLessThanOrEqual(390)}
})
