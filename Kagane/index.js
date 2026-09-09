var source=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});function t(e){"@babel/helpers - typeof";return t=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},t(e)}function n(e,n){if(t(e)!=`object`||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var i=r.call(e,n||`default`);if(t(i)!=`object`)return i;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(n===`string`?String:Number)(e)}function r(e){var r=n(e,`string`);return t(r)==`symbol`?r:r+``}function i(e,t,n){return(t=r(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var a=class{constructor(){i(this,`requiresExplicitSubmission`,!1)}reloadForm(){let e=this.__underlying_formId;e&&Application.formDidChange(e)}};function o(e,t,n){return e[`__closure_selector-`+t]=n,Application.Selector(e,`__closure_selector-`+t)}function s(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`listSection`,...n,items:t.filter(e=>e),allowAddition:!1,allowDeletion:!1,allowReorder:!1}}function c(e,t){let n;return n=typeof e==`string`?{id:e}:e,{type:`flowSection`,...n,items:t.filter(e=>e)}}function l(e,t){if(t.maxItemCount<1)throw Error(`[${t.id}] maxItemCount must not be less than one`);if(t.minItemCount<0)throw Error(`[${t.id}] minItemCount must not be less than zero`);if(t.minItemCount>=t.maxItemCount&&t.maxItemCount>1)throw Error(`[${t.id}] minItemCount must be less than maxItemCount, or both must be one`);if(t.value.length<t.minItemCount)throw Error(`[${t.id}] value count must not be less than minItemCount`);if(!t.value.every(e=>t.items.some(t=>t.id===e)))throw Error(`[${t.id}] All provided values must be inside items`);let n=Object.keys(t.value).length;return(t.layout==`flow`?c:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value.indexOf(r.id),a=i!==-1;return d(r.id,{title:r.title,value:a?{symbol:`checkmark`,style:`success`}:void 0,onSelect:o(e,`__select_${t.id}#${r.id}`,async()=>{if(a)n>t.minItemCount&&t.value.splice(i,1);else if(t.maxItemCount==1)t.value.splice(0,t.value.length,r.id);else if(n<t.maxItemCount)t.value.push(r.id);else return;t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function u(e,t){let n=Object.keys(t.value).length;return(t.layout==`flow`?c:s)({id:t.id,header:t.header,footer:t.footer},t.items.map(r=>{let i=t.value[r.id],a,s;switch(i){case`included`:t.layout==`flow`?(s=`success`,a=void 0):(s=void 0,a={symbol:`checkmark`,style:`success`});break;case`excluded`:t.layout==`flow`?(s=`error`,a=void 0):(s=void 0,a={symbol:`xmark`,style:`error`});break;default:a=void 0,s=void 0;break}return d(r.id,{style:s,title:r.title,value:a,onSelect:o(e,`__multiselect_${t.id}#${r.id}`,async()=>{let a,o=!t.maximum||n<t.maximum,s=t.allowEmptySelection&&n==1||n>1;switch(i){case`included`:if(t.allowExclusion){a=`excluded`;break}if(s){a=void 0;break}else return;case`excluded`:if(s){a=void 0;break}else return;case void 0:if(o){a=`included`;break}else return}a==null?delete t.value[r.id]:t.value[r.id]=a,t.onValueChange&&await Application.SelectorRegistry.selector(t.onValueChange)(),e.reloadForm()})})}))}function d(e,t){return{...t,id:e,type:`labelRow`,isHidden:t.isHidden??!1,isSelectable:t.onSelect!=null}}function f(e,t){return{...t,id:e,type:`inputRow`,isHidden:t.isHidden??!1}}function p(e,t){return{...t,id:e,type:`toggleRow`,isHidden:t.isHidden??!1}}function m(e,t){let n=Object.keys(t.value).length;return te(e,{form:new ne(t.title,t),title:t.title,subtitle:t.subtitle,value:n==1?`${(`items`in t?t.items.find(e=>e.id==t.value[0])?.title:t.options.find(e=>e.id==t.value[0])?.title)??`1 item`}`:`${Object.keys(t.value).length} items`,isHidden:t.isHidden})}function ee(e,t){return te(e,{form:new re(t.title,t),title:t.title,subtitle:t.subtitle,value:`${Object.keys(t.value).length} items`,isHidden:t.isHidden})}function te(e,t){return{...t,id:e,type:`navigationRow`,isHidden:t.isHidden??!1}}var ne=class extends a{constructor(e,t){super(),i(this,`title`,void 0),i(this,`params`,void 0),i(this,`states`,[]),i(this,`requiresExplicitSubmission`,!0),this.title=e,this.params=t,this.states=[...t.value]}getSections(){return[l(this,{id:`select`,value:this.states,layout:`layout`in this.params?this.params.layout:`list`,items:`items`in this.params?this.params.items:this.params.options,minItemCount:this.params.minItemCount,maxItemCount:this.params.maxItemCount,isHidden:this.params.isHidden})]}async formDidSubmit(){await Application.SelectorRegistry.selector(this.params.onValueChange)(this.states)}},re=class extends a{constructor(e,t){super(),i(this,`title`,void 0),i(this,`params`,void 0),i(this,`states`,{}),i(this,`requiresExplicitSubmission`,!0),this.title=e,this.params=t,this.states={...t.value}}getSections(){return[u(this,{id:`multiselect`,value:this.states,items:this.params.items,allowExclusion:this.params.allowExclusion,allowEmptySelection:this.params.allowEmptySelection,maximum:this.params.maximum,layout:this.params.layout})]}async formDidSubmit(){await Application.SelectorRegistry.selector(this.params.onValueChange)(this.states)}},ie=class extends a{constructor(...e){super(...e),i(this,`requiresExplicitSubmission`,!0)}async formDidSubmit(){}formDidCancel(){}},h=class{constructor(e){i(this,`id`,void 0),this.id=e}registerInterceptor(){Application.registerInterceptor(this.id,Application.Selector(this,`interceptRequest`),Application.Selector(this,`interceptResponse`))}unregisterInterceptor(){Application.unregisterInterceptor(this.id)}};let g={},_={},ae=async e=>{if(g[e]){await g[e],await ae(e);return}g[e]=new Promise(t=>_[e]=()=>{delete g[e],t()})},oe=e=>{_[e]&&_[e]()};var se=class extends h{constructor(e,t){super(e),i(this,`options`,void 0),i(this,`promise`,void 0),i(this,`currentRequestsMade`,0),i(this,`lastReset`,Date.now()),i(this,`imageRegex`,new RegExp(/\.(avif|gif|jpeg|jpg|jxl|png|webp)(\?|$)/i)),this.options=t}async interceptRequest(e){return this.options.ignoreImages&&this.imageRegex.test(e.url)?e:(await ae(this.id),await this.incrementRequestCount(),oe(this.id),e)}async interceptResponse(e,t,n){return n}async incrementRequestCount(){if(await this.promise,(Date.now()-this.lastReset)/1e3>this.options.bufferInterval&&(this.currentRequestsMade=0,this.lastReset=Date.now()),this.currentRequestsMade+=1,this.currentRequestsMade>=this.options.numberOfRequests){let e=(Date.now()-this.lastReset)/1e3;if(e<=this.options.bufferInterval){let t=this.options.bufferInterval-e;console.log(`[BasicRateLimiter] rate limit hit, sleeping for ${t}`),this.promise=Application.sleep(t)}}}},v=class extends Error{constructor(e,t=`Cloudflare bypass is required`){super(t),i(this,`resolutionRequest`,void 0),i(this,`type`,`cloudflareError`),this.resolutionRequest=e}};function ce(e){let t={},n=e.match(/^(?:([a-zA-Z][a-zA-Z\d+\-.]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);if(!n)throw Error(`Invalid URL string provided.`);if(n[1]!==void 0&&n[1]!==``&&(t.protocol=n[1]),n[2]!==void 0&&n[2]!==``){let e=n[2],r=``,i=``,a=e.indexOf(`@`);if(a!==-1){if(r=e.substring(0,a),i=e.substring(a+1),r!==``){let e=r.indexOf(`:`);e===-1?(t.username=r,t.password=``):(t.username=r.substring(0,e),t.password=r.substring(e+1))}}else i=e;if(i!==``)if(i.startsWith(`[`)){let e=i.indexOf(`]`);if(e===-1)throw Error(`Invalid IPv6 address in URL update.`);t.hostname=i.substring(0,e+1);let n=i.substring(e+1);n.startsWith(`:`)&&(t.port=n.substring(1))}else{let e=i.lastIndexOf(`:`);e!==-1&&i.indexOf(`:`)===e?(t.hostname=i.substring(0,e),t.port=i.substring(e+1)):(t.hostname=i,t.port=``)}}if(n[3]!==void 0&&n[3]!==``&&(t.path=n[3].startsWith(`/`)?n[3]:`/${n[3]}`),n[4]!==void 0){let e={},r=n[4].split(`&`);for(let t of r){if(!t)continue;let[n,r=``]=t.split(`=`);if(n===void 0)continue;let i=decodeURIComponent(n),a=decodeURIComponent(r);if(i in e){let t=e[i];Array.isArray(t)?t.push(a):e[i]=[t,a]}else e[i]=a}t.queryItems=e}return n[5]!==void 0&&(t.fragment=n[5]),t}var y=class{constructor(e){i(this,`protocol`,void 0),i(this,`hostname`,void 0),i(this,`path`,void 0),i(this,`username`,void 0),i(this,`password`,void 0),i(this,`port`,void 0),i(this,`queryItems`,void 0),i(this,`fragment`,void 0);let t=ce(e);if(!t.hostname||!t.protocol)throw Error(`URL Hostname and Protocol are required`);this.hostname=t.hostname,this.protocol=t.protocol,this.path=t.path??``,this.username=t.username,this.password=t.password,this.port=t.port,this.queryItems=t.queryItems,this.fragment=t.fragment}toString(){let e=`${this.protocol}://`;if(this.username!==void 0&&this.username!==``&&(e+=this.username,this.password!==void 0&&this.password!==``&&(e+=`:${this.password}`),e+=`@`),e+=this.hostname,this.port!==void 0&&this.port!==``&&(e+=`:${this.port}`),this.path!==``&&(e+=this.path.startsWith(`/`)?this.path:`/${this.path}`),this.queryItems!==void 0){let t=Object.keys(this.queryItems),n=[];if(t.length>0)for(let e of t){let t=this.queryItems[e];if(Array.isArray(t))for(let r of t)n.push(`${encodeURIComponent(e)}=${encodeURIComponent(r)}`);else t!==void 0&&n.push(`${encodeURIComponent(e)}=${encodeURIComponent(t)}`)}e+=`?${n.join(`&`)}`}return this.fragment!==void 0&&(e+=`#${this.fragment}`),e}setProtocol(e){if(e===``)throw Error(`Protocol is required`);return this.protocol=e,this}setUsername(e){return e===``?this.username=void 0:this.username=e,this}setPassword(e){return e===``?this.password=void 0:this.password=e,this}setHostname(e){if(e===``)throw Error(`Hostname is required`);return this.hostname=e,this}setPort(e){return e===``?this.port=void 0:this.port=e,this}setPath(e){return this.path=e.startsWith(`/`)?e:`/${e}`,this}addPathComponent(e){return this.path=(this.path??``)+(e.startsWith(`/`)?e:`/${e}`),this}setQueryItems(e){return this.queryItems=e,this}setQueryItem(e,t){return this.queryItems===void 0&&(this.queryItems={}),this.queryItems[e]=t,this}removeQueryItem(e){return delete this.queryItems?.[e],this}setFragment(e){return this.fragment=e,this}update(e){let t;return t=typeof e==`string`?ce(e):e,t.protocol!==void 0&&this.setProtocol(t.protocol),t.username!==void 0&&this.setUsername(t.username),t.password!==void 0&&this.setPassword(t.password),t.hostname!==void 0&&this.setHostname(t.hostname),t.port!==void 0&&this.setPort(t.port),t.path!==void 0&&this.setPath(t.path),t.queryItems!==void 0&&this.setQueryItems(t.queryItems),t.fragment!==void 0&&this.setFragment(t.fragment),this}};let le=`cookie_store_cookies`;var ue=class extends h{get cookies(){return Object.freeze(Object.values(this._cookies))}set cookies(e){let t={};for(let n of e)this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t,this.saveCookiesToStorage()}constructor(e){super(`cookie_store`),i(this,`options`,void 0),i(this,`_cookies`,{}),this.options=e,this.loadCookiesFromStorage()}async interceptRequest(e){return e.cookies={...e.cookies??{},...this.cookiesForUrl(e.url).reduce((e,t)=>(e[t.name]=t.value,e),{})},e}async interceptResponse(e,t,n){let r=this._cookies;for(let e of t.cookies){let t=this.cookieIdentifier(e);if(this.isCookieExpired(e)){delete r[t];continue}r[t]=e}return this._cookies=r,this.saveCookiesToStorage(),n}setCookie(e){this.isCookieExpired(e)||(this._cookies[this.cookieIdentifier(e)]=e,this.saveCookiesToStorage())}deleteCookie(e){delete this._cookies[this.cookieIdentifier(e)]}cookiesForUrl(e){let t=new y(e),n=t.hostname;if(!n)return[];let r={},i=t.path.startsWith(`/`)?t.path:`/${t.path}`,a=n.split(`.`),o=i.split(`/`);o.shift();let s=this.cookies;for(let e of s){if(this.isCookieExpired(e)){delete this._cookies[this.cookieIdentifier(e)];continue}let t=this.cookieSanitizedDomain(e).split(`.`);if(a.length<t.length||t.length==0)continue;let n=!0;for(let e=0;e<t.length;e++){let r=t.length-1-e,i=a.length-1-e;if(t[r]!=a[i]){n=!1;break}}if(!n)continue;let s=this.cookieSanitizedPath(e),c=s.split(`/`);c.shift();let l=0;if(i===s)l=2**53-1;else if(c.length===0||s===`/`)l=1;else if(i.startsWith(s)&&o.length>=c.length)for(let e=0;e<c.length&&c[e]===o[e];e++)l+=1;l<=0||(r[e.name]?.pathMatches??0)<l&&(r[e.name]={cookie:e,pathMatches:l})}return Object.values(r).map(e=>e.cookie)}cookieIdentifier(e){return`${e.name}-${this.cookieSanitizedDomain(e)}-${this.cookieSanitizedPath(e)}`}cookieSanitizedPath(e){return e.path?.startsWith(`/`)?e.path:`/`+(e.path??``)}cookieSanitizedDomain(e){return e.domain.replace(/^(www)?\.?/gi,``).toLowerCase()}isCookieExpired(e){return!!(e.expires&&e.expires.getTime()<=Date.now())}loadCookiesFromStorage(){if(this.options.storage==`memory`)return;let e=Application.getState(le);if(!e){this._cookies={};return}let t={};for(let n of e)!n.expires||this.isCookieExpired(n)||(t[this.cookieIdentifier(n)]=n);this._cookies=t}saveCookiesToStorage(){this.options.storage!=`memory`&&Application.setState(this.cookies.filter(e=>e.expires),le)}},de;(function(e){e[e.NONE=0]=`NONE`,e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.CHAPTER_PROVIDING=1]=`CHAPTER_PROVIDING`,e[e.MANGA_PROGRESS=2]=`MANGA_PROGRESS`,e[e.MANGA_PROGRESS_PROVIDING=2]=`MANGA_PROGRESS_PROVIDING`,e[e.PROGRESS_PROVIDING=2]=`PROGRESS_PROVIDING`,e[e.DISCOVER_SECIONS=4]=`DISCOVER_SECIONS`,e[e.DISCOVER_SECIONS_PROVIDING=4]=`DISCOVER_SECIONS_PROVIDING`,e[e.DISCOVER_SECTION_PROVIDING=4]=`DISCOVER_SECTION_PROVIDING`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.MANAGED_COLLECTION_PROVIDING=8]=`MANAGED_COLLECTION_PROVIDING`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.CLOUDFLARE_BYPASS_PROVIDING=16]=`CLOUDFLARE_BYPASS_PROVIDING`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`,e[e.SETTINGS_FORM_PROVIDING=32]=`SETTINGS_FORM_PROVIDING`,e[e.MANGA_SEARCH=64]=`MANGA_SEARCH`,e[e.SEARCH_RESULTS_PROVIDING=64]=`SEARCH_RESULTS_PROVIDING`,e[e.SEARCH_RESULT_PROVIDING=64]=`SEARCH_RESULT_PROVIDING`})(de||(de={}));var b;(function(e){e.EVERYONE=`SAFE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(b||(b={}));var x;(function(e){e[e.featured=0]=`featured`,e[e.simpleCarousel=1]=`simpleCarousel`,e[e.prominentCarousel=2]=`prominentCarousel`,e[e.chapterUpdates=3]=`chapterUpdates`,e[e.genres=4]=`genres`})(x||(x={})),Object.freeze({items:[],metadata:void 0});let S=`https://kagane.to`,C=S,fe=`kagane-integrity-token`,w=`kagane-content-rating`,pe=`kagane-source-display-mode`,me=`kagane-chapter-title-mode`,he=`kagane-excluded-genres`,ge=`kagane-content-languages`,_e=`kagane-tags-cache-v1`,ve=`kagane-home-section`,ye=[`safe`,`suggestive`,`erotica`,`pornographic`],be=[{id:`safe`,title:`Safe`},{id:`suggestive`,title:`Suggestive`},{id:`erotica`,title:`Erotica`},{id:`pornographic`,title:`Pornographic`}],xe=[{id:`all`,title:`Show All`},{id:`official`,title:`Official Sources Only`},{id:`scanlations`,title:`Scanlations Only`}],T=[{id:`optional`,title:`Title Only`},{id:`always`,title:`Ch.X + Title`},{id:`vol_chapter`,title:`Vol.X Ch.Y + Title`}],E=[{id:`en`,title:`English`},{id:`ja`,title:`Japanese`},{id:`ko`,title:`Korean`},{id:`zh-Hans`,title:`Chinese Simplified`},{id:`zh-Hant`,title:`Chinese Traditional`},{id:`es`,title:`Spanish`},{id:`es-419`,title:`Spanish Latin America`},{id:`fr`,title:`French`},{id:`de`,title:`German`},{id:`pt`,title:`Portuguese`},{id:`pt-BR`,title:`Portuguese Brazil`},{id:`ru`,title:`Russian`},{id:`it`,title:`Italian`},{id:`id`,title:`Indonesian`},{id:`vi`,title:`Vietnamese`},{id:`th`,title:`Thai`},{id:`pl`,title:`Polish`},{id:`hi`,title:`Hindi`},{id:`ar`,title:`Arabic`}],Se=[`Manga`,`Manhwa`,`Manhua`,`Comic`,`Other`],Ce=[{id:`Ongoing`,value:`Ongoing`},{id:`Completed`,value:`Completed`},{id:`Abandoned`,value:`Cancelled`},{id:`Hiatus`,value:`Hiatus`}],we=[{id:`relevance`,label:`Relevance`},{id:`total_views,desc`,label:`Popular (Total Views)`},{id:`avg_views,desc`,label:`Popular (Average Views)`},{id:`avg_views_today,desc`,label:`Popular (Today)`},{id:`avg_views_week,desc`,label:`Popular (Week)`},{id:`avg_views_month,desc`,label:`Popular (Month)`},{id:`updated_at,desc`,label:`Latest`},{id:`series_name,desc`,label:`By Name`},{id:`books_count,desc`,label:`Books Count`},{id:`created_at,desc`,label:`Created At`}];var Te=class extends h{async interceptRequest(e){return{...e,headers:{...e.headers,origin:S,referer:`${S}/`,"user-agent":await Application.getDefaultUserAgent()}}}async interceptResponse(e,t,n){if(t.headers?.[`cf-mitigated`]===`challenge`)throw new v({url:`${S}/`,method:e.method??`GET`,headers:{"user-agent":await Application.getDefaultUserAgent()}});return n}};async function D(e){let[t,n]=await Application.scheduleRequest(e);if(t.status!==200)throw Error(`Request failed with status ${t.status}: ${e.url}`);let r=Application.arrayBufferToUTF8String(n);try{return JSON.parse(r)}catch(t){let n=t instanceof Error?t.message:String(t);throw Error(`Failed to parse JSON from ${e.url}: ${n}`)}}let O,k,A,j;function Ee(e,t){for(let n of t)for(let t of Object.getOwnPropertyNames(n.prototype))t!==`constructor`&&Object.defineProperty(e.prototype,t,Object.getOwnPropertyDescriptor(n.prototype,t)??Object.create(null))}function M(e){let t=Oe(e);return t?new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`image`).addPathComponent(encodeURIComponent(t)).toString():``}function De(e){return Oe(e.cover_image_id)!==void 0}function Oe(e){if(typeof e==`string`)return e.trim()||void 0}async function ke(e){let t=await je();try{return await Ae(e,t)}catch{return Ae(e,await je(!0))}}async function Ae(e,t){return D({url:new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`books`).addPathComponent(e).setQueryItem(`is_datasaver`,String(Me())).toString(),method:`POST`,headers:{"content-type":`application/json`,"x-integrity-token":t},body:`{}`})}async function je(e=!1){let t=Number(Application.getState(`kagane-integrity-exp`)??0),n=Application.getState(fe);if(!e&&typeof n==`string`&&n&&t>Date.now())return n;let r=await D({url:`${S}/api/integrity`,method:`POST`,headers:{"content-type":`application/json`},body:``});return Application.setState(r.token,fe),Application.setState(String(r.exp*1e3),`kagane-integrity-exp`),r.token}function Me(){return Application.getState(`kagane-data-saver`)??!1}async function N(){let[e,t]=await Promise.all([P(),Ne()]);return{genres:Object.fromEntries(e.map(e=>[e.id,e.genre_name])),sources:t}}async function P(){if(O&&F(O))return O.entries;if(k)return k;k=Pe(`kagane-genres-cache-v1`,O,Le,()=>D({url:`${C}/api/v2/genres/list`,method:`GET`})).then(e=>(O=e,e.entries));try{return await k}finally{k=void 0}}async function Ne(){if(A&&F(A))return A.entries;if(j)return j;j=Pe(`kagane-sources-cache-v1`,A,Re,async()=>(await D({url:`https://kagane.to/api/v2/sources/list`,method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({source_types:null})})).sources??[]).then(e=>(A=e,e.entries));try{return await j}finally{j=void 0}}async function Pe(e,t,n,r){let i=Fe(e,n),a=i&&(!t||i.cachedAt>t.cachedAt)?i:t;if(a&&F(a))return a;try{let t=(await r()).filter(n),i={cachedAt:Date.now(),entries:t};return Ie(e,i),i}catch(e){if(e instanceof v)throw e;if(a)return a;throw e}}function Fe(e,t){let n=Application.getState(e);if(typeof n==`string`)try{let e=JSON.parse(n);return!I(e)||typeof e.cachedAt!=`number`||!Array.isArray(e.entries)||!e.entries.every(t)?void 0:{cachedAt:e.cachedAt,entries:e.entries}}catch{return}}function Ie(e,t){try{Application.setState(JSON.stringify(t),e)}catch{}}function F(e){return Date.now()-e.cachedAt<864e5}function I(e){return typeof e==`object`&&!!e}function Le(e){return I(e)&&typeof e.id==`string`&&e.id.length>0&&typeof e.genre_name==`string`&&e.genre_name.length>0&&(e.genre_type===void 0||e.genre_type===null||typeof e.genre_type==`string`)}function Re(e){return I(e)&&typeof e.source_id==`string`&&e.source_id.length>0&&typeof e.source_type==`string`&&typeof e.title==`string`}function ze(e){return e.length>0?e.charAt(0).toUpperCase()+e.slice(1):e}function L(e){if(Array.isArray(e)){let t=ye.filter(t=>e.includes(t));return t.length>0?t:[`safe`,`suggestive`]}if(typeof e==`string`&&e.trim()){try{let t=JSON.parse(e);if(Array.isArray(t))return L(t)}catch{}let t=ye.indexOf(e);if(t>=0)return ye.slice(0,t+1)}return[`safe`,`suggestive`]}function Be(e){return e.map(ze)}function R(e){switch(e?.trim().toLowerCase()){case`safe`:return b.EVERYONE;case`suggestive`:case`erotica`:return b.MATURE;case`pornographic`:return b.ADULT;default:return b.MATURE}}function Ve(e){if(!e)return;let t=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(e),n=new Date(t?e:`${e}Z`);return Number.isNaN(n.getTime())?void 0:n}function He(e){switch(e.toUpperCase()){case`ONGOING`:return`Ongoing`;case`COMPLETED`:return`Completed`;case`HIATUS`:return`Hiatus`;case`ABANDONED`:return`Cancelled`;default:return`Unknown`}}function Ue(e){if(!e)return;let t=Number(e);return Number.isFinite(t)?t:void 0}function z(e){let t=[...new Set(e.map(e=>e.trim()).filter(Boolean))];return t.length>0?t.join(`, `):void 0}function We(e,t,n,r=`optional`,i=[]){let a=B(t),o=B(n);return Ge(qe(e.trim(),o),[a,...i])}function B(e){let t=e?.trim();if(t)return t}function Ge(e,t){let n=[...new Set(t.map(B).filter(e=>!!e))];for(let t of n){let n=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),r=RegExp(`^(?:chapter|episode|ch\\.?|#)\\s*${n}(?:\\s*(?:[-:\\u2013\\u2014]|\\.(?!\\d))\\s*|\\s+|$)`,`i`),i=e.replace(r,``).trim();if(i!==e)return i}return e.replace(Ke(),``).trim()}function Ke(){return/^(?:chapter|episode|ch\.?|#)\s*\d+(?:\.\d+)?(?:\s*(?:[-:\u2013\u2014]|\.(?!\d))\s*|\s+|$)/i}function qe(e,t){let n=B(t);if(!n)return e;let r=n.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),i=RegExp(`^(?:volume|vol\\.?)\\s*${r}(?:\\s*(?:[-:\\u2013\\u2014]|\\.(?!\\d))\\s*|\\s+|$)`,`i`);return e.replace(i,``).trim()}let Je=`kagane-hidden-tag-categories`,Ye=`kagane-custom-hidden-tags`,Xe=`Abuse
Academy
Acting
Actor
Actress
Adaptation
Adoption
Adventurers
Age Gap
Age Regression
Alchemists
Alchemy
Amnesia
Angels
Anthology
Anti-Hero
Apocalypse
Archers
Aristocracy
Arranged Marriage
Artifacts
Artist
Assassins
Athletes
Baking
Ballet
Band
Baseball
Basketball
Beastkin
Beautiful Female Lead
Betrayal
Blacksmiths
Boss
Boxing
Bullying
Business
Butler
Cafe
Camping
Celebrity
Ceos
Chaebol
Chef
Childcare
Childhood Friends
Childhood Promise
Clingy Male Lead
Cohabitation
Cold Male Lead
College
Company
Conspiracy
Constellations
Contract Marriage
Contractual Relationship
Cooking
Corruption
Countryside
Crown Princes
Cultivation
Curse
Death Game
Debt
Demon King
Demon Lords
Demons
Depression
Devoted Male Lead
Divorce
Doctors
Doting Male Lead
Dragons
Drawing
Duchesses
Dukes
Dungeon
Dystopia
Elf
Emperors
Empresses
Enemies to Lovers
Espionage
Esports
Exorcism
Fairy
Fake Relationship
Familiars
Family
Fantasy World
Farming
Female Lead
Female Protagonist
First Love
Fishing
Fluff
Food
Found Family
Friends To Lovers
Full Color
Game Elements
Gamers
Gangs
Genius
Genius Male Lead
Ghost
Goddess
Gods
Golf
Guild Master
Guilds
Guitar
Handsome Male Lead
Healers
Healing
Hero
Hidden Identity
High School
Human Experimentation
Hunters
Idol
Immortality
Jealousy
Kemonomimi
Kidnapping
Kids
Kingdom
Kingdom Building
Kings
Knight
Light Novel
Living Together
Long Strip
Love Interest Falls In Love First
Love Triangle
Mafia
Mages
Magic Academy
Maids
Male Lead
Male Protagonist
Marriage
Memory Loss
Mercenaries
Merchants
Military Service
Mind Control
Misunderstanding
Mma
Monster Girls
Monsters
Murder
Murim
Musician
Necromancers
Neighbors
Nobility
Obsession
Obsessive Love
Office Romance
Office Worker
One-sided love
Orcs
Overpowered
Overpowered Protagonist
Painters
Painting
Parallel World
Parenting
Parody
Pets
Photography
Piano
Politics
Possession
Post-Apocalyptic
Poverty
Power Couple
Pregnancy
Priests
Prince
Princess
Prison
Prodigy
Professors
Psychics
Psychopath
Queens
Racing
Rebirth
Redemption
Regression
Reincarnation
Restaurant
Revenge
Roommates
Royalty
Satire
School
Second Chance
Secret Identity
Secret Relationship
Sects
Serial Killers
Servant
Shamans
Singing
Single Father
Single Mother
Single Parent
Slapstick
Slave
Slavery
Slow Life
Soccer
Soldier
Spirits
Spy
Streamers
Strong Female Lead
Strong Male Lead
Student
Summoners
Summonings
Superpowers
Surgeons
Survival
Swimming
Sword and Magic
Sword and Sorcery
Swordsman
System
Taming
Teacher
Tennis
Territory Management
Theater
Time Loop
Time Travel
Towers
Transformation
Transmigration
Trauma
Travel
Tsundere
Undead
Unrequited Love
Vampire
Video Games
Villainess
Villains
Violin
Virtual Reality
Volleyball
War
Weak To Strong
Web Novel
Werewolf
Wholesome
Witch
Workplace Romance
Writers
Yakuza
Yandere
Youkai
Zombie`.split(`
`),V=[{id:`boys_love`,title:`Boys Love`,tagIds:[`019da7d4-cff3-7601-88c7-e230067edb5f`,`019c500a-3948-7bc1-a059-5308a3a6d620`,`019dfd9e-f74e-77d2-ab56-0332a8e909ef`,`019e3c55-1bc4-7e08-8127-e459337b06e6`,`019c203b-da2b-7127-a5e9-f4b3e33996a7`,`019c2065-eaa6-74f4-a460-a5b4034b5cdf`,`019c2536-45c2-7afe-b456-7ca5500b6fe6`,`019c29cc-4f80-73b0-879f-a1145c67f94d`,`019dbae0-e7d2-7f6f-8691-f92d6298809e`]},{id:`girls_love`,title:`Girls Love`,tagIds:[`019c3cbc-60bf-7cba-88e6-82243e7c9a96`,`019dbaf6-5f71-73fb-a0e0-897289a63c4e`,`019c2060-746d-7ccb-b6dd-7da20918e3e7`,`019c207d-bdcb-77c6-9f4b-53015461d4aa`,`019e4a5f-f787-76a1-9de5-a2ab433e554a`]},{id:`incest`,title:`Incest`,tagIds:[`019c52d4-9e54-724e-a929-da42b6d42d42`,`019c2530-abb9-7d0d-82bb-37a1683fecb5`,`019c3407-81dd-78d5-83e3-257221709b14`,`019c206e-5376-7f08-8b90-7833a5620c9d`,`019c29c7-eab6-77d5-9450-574436e18d7b`,`019c2045-518d-7bf4-a067-414dc9a054a6`,`019c298d-19b6-745d-9b18-3db6b009f685`,`019c2558-ed36-73a1-ae93-884b21e881f6`,`019c2042-e4ac-76c2-af97-313b41617c18`,`019c3cbe-1b1d-7bc9-aea9-65c7e77dcaf7`,`019c254b-cb89-7810-86fa-431bbcf97983`,`019c2091-d0c8-7ed4-8b2b-e586d9663bd9`,`019c2071-7759-7dcf-8014-1689073ddb98`,`019c291f-0dd9-76cc-a57e-c3735aa54d54`,`019c2921-da37-79ad-b5d9-b08dd7847fe7`,`019c680f-bb7d-78d0-8c95-2dd6339bef91`,`019c2920-5620-799e-a2f9-2aa0823f8693`,`019c2542-3702-7907-afb0-32ae6c1b6bf1`,`019c2922-ee12-7a1b-bb71-87f7f19c3185`]},{id:`netorare`,title:`Netorare (NTR)`,tagIds:[`019c2050-00e9-7e47-825d-a4397300eb00`,`019c291f-66e1-7ff7-a444-e1a1b9370cd7`,`019c2920-0908-7a38-8a92-4bde5d1301bf`,`019c2925-6e05-706c-9311-d69e8dd54c1b`,`019c2555-1694-7e49-8b29-08ae4de2c62e`]},{id:`rape`,title:`Rape / Sexual Assault`,tagIds:[`019c2069-8616-7901-9af4-30fc5c445fdd`,`019c2045-b1a0-7a54-925d-ec2999c29201`,`019c2542-b056-7db2-b53b-a9ec113d828e`,`019c2042-abcc-72c3-a98a-0ba8b07cb42b`,`019c207a-354d-74ea-bd39-42b5e48a05a7`,`019c2054-2144-7785-a831-09cc0441e51d`,`019c206c-0dd8-781f-a4b2-aff954a94640`,`019c253e-d363-7fe3-a173-3251a4c02b99`,`019c2064-3ad6-717c-af64-6c29fe14a02b`,`019c2532-56d0-7e82-8ee2-c905700e69b8`,`019d5a9f-9555-7323-8935-6db2d2ef5335`,`019c2045-518b-744f-9449-21c126c751ef`,`019c2045-51af-772c-8861-338e0173ebe0`,`019c680f-bb57-7943-acea-e6fca1fae863`,`019c2532-05d4-78d5-90ab-596e3454c3eb`,`019c2068-4640-73a6-9c7c-ec76d530b24a`,`019c2082-2ce3-78ef-bfe1-744ef77c777d`,`019c2050-c9be-7424-997c-054695622459`,`019c2070-2a5f-7b16-bd46-25090c52f5fc`,`019c2075-759f-7cd7-8fa3-9e19c4cc0dfa`,`019c2045-5190-71cb-b9a6-13497669f3f6`,`019c2984-fdb6-7b6c-8457-ba81c085280c`]},{id:`bestiality`,title:`Bestiality`,tagIds:[`019c2092-70bf-7cc7-a550-5b4e4b5a9b57`]},{id:`lolicon`,title:`Lolicon`,tagIds:[`019c2047-5cd9-7106-84c6-0c9bfe6ed5aa`,`019c27c7-01ba-7a6f-816d-c95364c54287`,`019c2090-831e-79c1-b80b-6c3b7114d0fd`,`019c27d2-1d93-7856-b141-3413f4548388`,`019c27d2-1d98-7b25-9287-7efa863130eb`]},{id:`shotacon`,title:`Shotacon`,tagIds:[`019c2922-bb20-7429-8b40-68d87d1a4e19`,`019c27d2-1d96-75da-9347-0e50699df114`,`019c27d6-e979-7c8c-bc0a-c3fa75c16ec7`,`019c29a7-ea59-728c-b15b-63b010afb4e2`,`019c253e-a039-7e8f-a369-891baf23605c`,`019c254a-a23f-7ec7-b33e-fe39efb67158`]}];var Ze=class extends a{constructor(e){super(),this.genres=e}getSections(){return[s({id:`content`,footer:`safe: Family-friendly content suitable for all ages. No mature themes.

suggestive: Includes mild fan service, romantic themes, and suggestive content.

erotica: Includes sexual content, violence, and mature themes. Not explicit pornography.

pornographic: All content including explicit sexual material.`},[this.contentLanguagesRow(),this.contentRatingRow(),this.sourceDisplayModeRow(),this.excludedGenresRow(),this.hiddenTagCategoriesRow(),this.customHiddenTagsRow()]),s(`display`,[this.showEditionRow(),this.showSourceRow(),this.chapterTitleModeRow()]),s(`reader`,[this.dataSaverRow()])]}contentLanguagesRow(){return m(`content-languages`,{title:`Content Languages`,options:E,value:K(),minItemCount:1,maxItemCount:E.length,onValueChange:Application.Selector(this,`handleContentLanguages`)})}contentRatingRow(){return m(`content-rating`,{title:`Content Rating`,options:be,value:Qe(),minItemCount:1,maxItemCount:be.length,onValueChange:Application.Selector(this,`handleContentRating`)})}sourceDisplayModeRow(){return m(`source-display-mode`,{title:`Sources`,options:xe,value:[U()],minItemCount:1,maxItemCount:1,onValueChange:Application.Selector(this,`handleSourceDisplayMode`)})}excludedGenresRow(){let e=this.genres.map(e=>({id:e.id,title:e.genre_name})).sort((e,t)=>e.title.localeCompare(t.title));return m(`excluded-genres`,{title:`Excluded Genres`,options:e,value:G(),minItemCount:0,maxItemCount:e.length,onValueChange:Application.Selector(this,`handleExcludedGenres`)})}hiddenTagCategoriesRow(){return m(`hidden-tag-categories`,{title:`Hidden Tags`,options:V.map(e=>({id:e.id,title:e.title})),value:lt(),minItemCount:0,maxItemCount:V.length,onValueChange:Application.Selector(this,`handleHiddenTagCategories`)})}customHiddenTagsRow(){return f(`custom-hidden-tags`,{title:`Custom Hidden Tags (comma-separated)`,value:dt().join(`, `),onValueChange:Application.Selector(this,`handleCustomHiddenTags`)})}showEditionRow(){return p(`show-edition`,{title:`Show Edition in Title`,value:tt(),onValueChange:Application.Selector(this,`handleShowEdition`)})}showSourceRow(){return p(`show-source`,{title:`Show Source in Title`,value:W(),onValueChange:Application.Selector(this,`handleShowSource`)})}chapterTitleModeRow(){return m(`chapter-title-mode`,{title:`Chapter Title Format`,options:T,value:[ot()],minItemCount:1,maxItemCount:1,onValueChange:Application.Selector(this,`handleChapterTitleMode`)})}dataSaverRow(){return p(`data-saver`,{title:`Data Saver`,value:it(),onValueChange:Application.Selector(this,`handleDataSaver`)})}async handleContentLanguages(e){mt(e),Application.invalidateDiscoverSections(),this.reloadForm()}async handleContentRating(e){$e(e),Application.invalidateDiscoverSections(),this.reloadForm()}async handleSourceDisplayMode(e){et(e[0]??`all`),Application.invalidateDiscoverSections(),this.reloadForm()}async handleExcludedGenres(e){ct(e),Application.invalidateDiscoverSections(),this.reloadForm()}async handleHiddenTagCategories(e){ut(e),Application.invalidateDiscoverSections(),this.reloadForm()}async handleCustomHiddenTags(e){ft(e),Application.invalidateDiscoverSections(),this.reloadForm()}async handleShowEdition(e){nt(e),this.reloadForm()}async handleShowSource(e){rt(e),this.reloadForm()}async handleChapterTitleMode(e){st(e[0]??`optional`),this.reloadForm()}async handleDataSaver(e){at(e),this.reloadForm()}};function H(e,t,n){let r=Application.getState(e),i=t;if(Array.isArray(r))i=r;else if(typeof r==`string`&&r.trim())try{i=JSON.parse(r)}catch{i=t}if(!Array.isArray(i))return t;let a=i.filter(e=>typeof e==`string`&&(!n||n.has(e)));return a.length>0||t.length===0?a:t}function Qe(){let e=Application.getState(w),t=L(e);return typeof e==`string`&&Application.setState(t,w),t}function $e(e){Application.setState(L(e),w)}function U(){let e=Application.getState(pe);return e===`official`||e===`scanlations`?e:`all`}function et(e){Application.setState(e===`official`||e===`scanlations`?e:`all`,pe)}function tt(){return Application.getState(`kagane-show-edition`)??!1}function nt(e){Application.setState(e,`kagane-show-edition`)}function W(){return Application.getState(`kagane-show-source`)??!1}function rt(e){Application.setState(e,`kagane-show-source`)}function it(){return Application.getState(`kagane-data-saver`)??!1}function at(e){Application.setState(e,`kagane-data-saver`)}function ot(){let e=Application.getState(me);return typeof e==`string`&&T.some(t=>t.id===e)?e:`optional`}function st(e){Application.setState(T.some(t=>t.id===e)?e:`optional`,me)}function G(){return H(he,[])}function ct(e){Application.setState([...new Set(e.map(e=>e.trim()).filter(Boolean))],he)}function lt(){return H(Je,[],new Set(V.map(e=>e.id)))}function ut(e){let t=new Set(V.map(e=>e.id));Application.setState([...new Set(e.filter(e=>t.has(e)))],Je)}function dt(){return H(Ye,[])}function ft(e){Application.setState([...new Set(e.split(`,`).map(e=>e.trim()).filter(Boolean))],Ye)}function pt(e,t){let n=Object.entries(t);return[...new Set(e.flatMap(e=>{if(t[e])return[e];let r=e.toLowerCase();return n.filter(([,e])=>e.toLowerCase()===r).map(([e])=>e)}))]}function K(){return H(ge,[`en`],new Set(E.map(e=>e.id)))}function mt(e){let t=new Set(E.map(e=>e.id)),n=e.filter(e=>t.has(e));Application.setState(n.length>0?n:[`en`],ge)}var ht=class{async getSettingsForm(){let e=await P();return gt(e),new Ze(e)}};function gt(e){let t=G(),n=pt(t,Object.fromEntries(e.map(e=>[e.id,e.genre_name])));(t.length!==n.length||t.some((e,t)=>e!==n[t]))&&ct(n)}let _t=new Set([`Dark Horse Comics`,`Flame Comics`,`MangaDex`,`Square Enix Manga`]);function vt(e,t,n,r,i){let a=yt(e,i),o=!!(e.source_id&&i.find(t=>t.source_id===e.source_id)?.source_type.toLowerCase()===`official`);return(e.series_books??[]).map((e,i)=>bt(e,t,n,r,a,o,i))}function yt(e,t){if(e.format&&_t.has(e.format))return!0;let n=e.source_id?t.find(t=>t.source_id===e.source_id)?.title:void 0;return!!(n&&_t.has(n))}function bt(e,t,n,r,i,a,o){let s=Ue(e.chapter_no),c=Ue(e.volume_no),l=c!==void 0&&s===void 0;return{chapterId:e.book_id,sourceManga:t,title:We(e.title,e.chapter_no,e.volume_no,n,[String(e.sort_no)]),chapNum:l?0:i?e.sort_no:s??0,volume:c??0,langCode:r,version:xt(e,a),publishDate:Ve(e.created_at),sortingIndex:o}}function xt(e,t){let n=e.groups?.map(e=>e.title.trim()).filter(Boolean).join(`, `);return t?n?`${n} ⭐`:`Official ⭐`:n||void 0}var St=class{async processTitlesForUpdates(e,t){await Application.scheduleRequest({url:`${S}/`,method:`GET`})}async getChapters(e){let t=await D({url:Ct(e.mangaId),method:`GET`}),n=await wt(),r=K()[0]??`en`;return vt(t,e,ot(),r,n)}async getChapterDetails(e){let t=e.chapterId,n=await ke(t),r=it(),i=[...n.manifest?.pages??[]].sort((e,t)=>e.page_no-t.page_no).map(e=>new y(n.cache_url).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`books`).addPathComponent(`page`).addPathComponent(t).addPathComponent(`${e.page_id}.${e.ext??`jxl`}`).setQueryItem(`token`,n.access_token).setQueryItem(`is_datasaver`,String(r)).toString());return{id:t,mangaId:e.sourceManga.mangaId,pages:i}}};function Ct(e){return new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`series`).addPathComponent(e).toString()}async function wt(){try{return(await N()).sources}catch{return[]}}var Tt;(function(e){e.singleRowNormal=`singleRowNormal`,e.singleRowLarge=`singleRowLarge`,e.doubleRow=`doubleRow`,e.featured=`featured`})(Tt||(Tt={}));var Et;(function(e){e[e.MANGA_CHAPTERS=1]=`MANGA_CHAPTERS`,e[e.MANGA_TRACKING=2]=`MANGA_TRACKING`,e[e.HOMEPAGE_SECTIONS=4]=`HOMEPAGE_SECTIONS`,e[e.COLLECTION_MANAGEMENT=8]=`COLLECTION_MANAGEMENT`,e[e.CLOUDFLARE_BYPASS_REQUIRED=16]=`CLOUDFLARE_BYPASS_REQUIRED`,e[e.SETTINGS_UI=32]=`SETTINGS_UI`})(Et||(Et={}));var Dt;(function(e){e.EVERYONE=`EVERYONE`,e.MATURE=`MATURE`,e.ADULT=`ADULT`})(Dt||(Dt={}));var Ot;(function(e){e.BLUE=`default`,e.GREEN=`success`,e.GREY=`info`,e.YELLOW=`warning`,e.RED=`danger`})(Ot||(Ot={}));let q={};q.createSourceStateManager=function(){return{keychain:{async store(e,t){Application.setSecureState(t,e)},async retrieve(e){return Application.getSecureState(e)}},async store(e,t){Application.setState(t,e)},async retrieve(e){return Application.getState(e)}}};function kt(e){let t=e.url;e.param&&(t+=e.param);let n={};for(let t of e.cookies??[])n[t.name]=t.value;return{url:t,method:e.method,body:e.data,headers:e.headers,cookies:n}}function At(e){return{url:e.url,method:e.method,headers:e.headers??{},cookies:Object.keys(e.cookies??{}).map(t=>({name:t,value:e.cookies[t],domain:``})),data:e.body}}q.createRequestManager=function(e){let t=new class extends h{constructor(e){super(`main`),i(this,`legacyInterceptor`,void 0),this.legacyInterceptor=e}async interceptRequest(e){if(!this.legacyInterceptor)return e;let t=At(e);return kt(await this.legacyInterceptor.interceptRequest(t))}async interceptResponse(e,t,n){return this.legacyInterceptor,n}}(e.interceptor),n=new se(`rateLimit`,{numberOfRequests:e.requestsPerSecond??2,bufferInterval:1,ignoreImages:!0}),r=new ue({storage:`memory`});return t.registerInterceptor(),n.registerInterceptor(),r.registerInterceptor(),{__backing_interceptor:t,__backing_rateLimit:n,__backing_cookieStore:r,interceptor:e.interceptor,cookieStore:{getAllCookies(){return r.cookies},addCookie(e){r.setCookie(e)},removeCookie(e){r.deleteCookie(e)}},async getDefaultUserAgent(){return Application.getDefaultUserAgent()},requestsPerSecond:e.requestsPerSecond??2,requestTimeout:e.requestTimeout??3e4,async schedule(e){let t=kt(e);console.log(`[COMPAT] SCHEDULING REQUEST TO `+t.url);let[n,r]=await Application.scheduleRequest(t);return{request:e,headers:n.headers,status:n.status,data:Application.arrayBufferToUTF8String(r),get rawData(){return new Uint8Array(r)}}}}},globalThis.App=new Proxy(q,{get(e,t){if(e[t])return e[t];if(typeof t==`string`&&t.startsWith(`create`)){if(t.startsWith(`createDUI`)){let e=t.slice(6);return t=>Object.defineProperty(t,"type",{enumerable:!0,value:e})}return e=>e}}});var jt=class extends ie{constructor(e,t){super(),i(this,`filters`,void 0),i(this,`selectedFilterValues`,void 0),this.selectedFilterValues={};for(let t of e??[])this.selectedFilterValues[t.id]=t.value;t instanceof Promise?(this.filters=void 0,t.then(e=>this.filters=e).catch(e=>this.filters=e).finally(()=>this.reloadForm())):this.filters=t}getSections(){return this.filters?this.filters instanceof Error?[s(`error`,[d(`error`,{title:`Error loading search filters`,subtitle:this.filters.message})])]:this.filters.map(e=>{switch(e.type){case`dropdown`:{let t=[this.selectedFilterValues[e.id]??e.value];return l(this,{id:e.id,header:e.title,value:t,onValueChange:o(this,e.id,async()=>{this.selectedFilterValues[e.id]=t[0]}),layout:`list`,items:e.options.map(e=>({id:e.id,title:e.value})),minItemCount:1,maxItemCount:1})}case`multiselect`:{let t=this.selectedFilterValues[e.id]??e.value;return s({id:e.id},[ee(e.id,{title:e.title,layout:`flow`,value:t,items:e.options.map(e=>({id:e.id,title:e.value})),allowExclusion:e.allowExclusion,allowEmptySelection:e.allowEmptySelection,maximum:e.maximum,onValueChange:o(this,e.id,async t=>{this.selectedFilterValues[e.id]=t,this.reloadForm()})})])}case`input`:{let t=this.selectedFilterValues[e.id]??e.value;return s({id:e.id,header:e.title},[f(e.id,{title:e.title,value:t,onValueChange:o(this,e.id,async t=>{this.selectedFilterValues[e.id]=t,this.reloadForm()})})])}}}):[s(`loading`,[d(`loading`,{title:`Loading Filters`})])]}getSearchQueryMetadata(){return this.filters&&!(this.filters instanceof Error)?this.filters.map(e=>({id:e.id,value:this.selectedFilterValues[e.id]??e.value})):[]}async formDidSubmit(){if(!this.filters)throw Error(`Search filters are loading`);if(this.filters instanceof Error)throw this.filters}},Mt=class extends ie{constructor(e){super(),this.filters=e}getSections(){return[]}getSearchQueryMetadata(){return this.filters}};let J,Y;async function Nt(){if(J&&Date.now()-J.cachedAt<864e5)return J.entries;if(Y)return Y;Y=Pt(J).then(e=>(J=e,e.entries));try{return await Y}finally{Y=void 0}}async function Pt(e){let t=Bt(),n=t&&(!e||t.cachedAt>e.cachedAt)?t:e;if(n&&Date.now()-n.cachedAt<864e5)return n;try{let e=(await D({url:`${C}/api/v2/tags/list`,method:`GET`})).filter(Ht),t={cachedAt:Date.now(),entries:e};return Vt(t),t}catch(e){if(e instanceof v)throw e;if(n)return n;throw e}}function Ft(e){let t=new Map;for(let n of e){let e=X(n.tag_name),r=t.get(e)??[];r.includes(n.id)||r.push(n.id),t.set(e,r)}return t}function It(e){let t=Ft(e);return Xe.filter(e=>t.has(X(e))).map(e=>({id:t.get(X(e))?.[0]??``,value:e})).filter(e=>!!e.id).sort((e,t)=>e.value.localeCompare(t.value))}function Lt(e,t,n){let r=new Map(n.map(e=>[e.id,X(e.tag_name)]));return Z(e.flatMap(e=>{let n=r.get(e);return n?t.get(n)??[]:[e]}))}function Rt(e,t){return Z(e.flatMap(e=>t.get(X(e))??[]))}function zt(e){let t=[],n=[];for(let r of e.split(`,`)){let e=r.trim();if(!e)continue;let i=e.startsWith(`-`),a=i?e.slice(1).trim():e;a&&(i?n:t).push(a)}return{included:Z(t),excluded:Z(n)}}function Bt(){let e=Application.getState(_e);if(typeof e==`string`)try{let t=JSON.parse(e);return!Ut(t)||typeof t.cachedAt!=`number`||!Array.isArray(t.entries)||!t.entries.every(Ht)?void 0:{cachedAt:t.cachedAt,entries:t.entries}}catch{return}}function Vt(e){try{Application.setState(JSON.stringify(e),_e)}catch{}}function Ht(e){return Ut(e)&&typeof e.id==`string`&&e.id.length>0&&typeof e.tag_name==`string`&&e.tag_name.trim().length>0}function Ut(e){return typeof e==`object`&&!!e}function X(e){return e.trim().toLowerCase()}function Z(e){return[...new Set(e)]}let Wt=new Set([`avg_views_today,desc`,`avg_views_week,desc`,`avg_views_month,desc`,`avg_views,desc`]);function Gt(e){let t=e?.find(e=>e.id===ve)?.value;return typeof t==`string`&&Wt.has(t)?t:void 0}function Kt(e,t,n){let r=e.find(e=>e.id===t);return typeof r?.value==`string`&&r.value?r.value:n}function Q(e,t,n=`included`){let r=e.find(e=>e.id===t);return!r||typeof r.value==`string`?[]:Object.entries(r.value).filter(([,e])=>e===n).map(([e])=>e)}function qt(e,t){let n=e.find(e=>e.id===t);return typeof n?.value==`string`?n.value:``}function Jt(e,t,n=[]){let r=Yt(e.sources,t);return[{type:`multiselect`,id:`formats`,title:`Format`,options:Se.map(e=>({id:e,value:e})),value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0},...n.length>0?[{type:`multiselect`,id:`tags`,title:`Tags`,options:n,value:{},allowExclusion:!0,allowEmptySelection:!0,maximum:void 0}]:[],{type:`input`,id:`tags_text`,title:`Tags (typed)`,placeholder:`romance, -gore`,value:``},{type:`dropdown`,id:`tags_match_all`,title:`Tag Matching`,options:[{id:`true`,value:`Match All Selected Tags`},{id:`false`,value:`Match Any Selected Tag`}],value:`true`},{type:`multiselect`,id:`statuses`,title:`Status`,options:Ce,value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0},{type:`dropdown`,id:`genres_match_all`,title:`Genre Matching`,options:[{id:`true`,value:`Match All Selected Genres`},{id:`false`,value:`Match Any Selected Genre`}],value:`true`},{type:`multiselect`,id:`genres`,title:`Genres`,options:Object.entries(e.genres).sort(([,e],[,t])=>e.localeCompare(t)).map(([e,t])=>({id:e,value:t})),value:{},allowExclusion:!0,allowEmptySelection:!0,maximum:void 0},{type:`multiselect`,id:`sources`,title:`Sources`,options:r.sort((e,t)=>e.title.localeCompare(t.title)).map(e=>({id:e.source_id,value:e.title})),value:{},allowExclusion:!1,allowEmptySelection:!0,maximum:void 0}]}function Yt(e,t){return t===`official`?e.filter(e=>e.source_type.toLowerCase()===`official`):t===`scanlations`?e.filter(e=>{let t=e.source_type.toLowerCase();return t===`unofficial`||t===`mixed`}):e}var Xt=class{async getSearchFilters(){let e=await N(),t=[];try{t=It(await Nt())}catch(e){if(e instanceof v)throw e}return Jt(e,U(),t)}getAdvancedSearchForm(e){return Gt(e.metadata)?new Mt(e.metadata??[]):new jt(e.metadata,this.getSearchFilters())}async getSortingOptions(e){return Gt(e?.metadata)?[]:we}async getSearchResults(e,t,n){let r=t?.page??1,i=await N(),a=Gt(e.metadata),o=await Zt(a?{title:``,metadata:[]}:e,i),s=a??n?.id??`relevance`,c=new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`search`).addPathComponent(`series`).setQueryItem(`page`,String(r-1)).setQueryItem(`size`,`35`);s!==`relevance`&&c.setQueryItem(`sort`,s);let l=await D({url:c.toString(),method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(o)}),u=new Map(i.sources.map(e=>[e.source_id,e.title])),d=W();return{items:(l.content??[]).filter(De).map(e=>tn(e,u,d)),metadata:l.last===!1?{page:r+1}:void 0}}};async function Zt(e,t){let n=e.metadata??[],r={content_rating:Be(Qe()),content_lang:K()},i=$t(U());i&&(r.source_type=i);let a=e.title?.trim();a&&(r.title=a);let o=Q(n,`formats`);o.length>0&&(r.format=o);let s=Q(n,`statuses`);s.length>0&&(r.upload_status=s);let c=Q(n,`sources`);c.length>0&&(r.source_id=c);let l=Q(n,`genres`),u=[...Q(n,`genres`,`excluded`),...pt(G(),t.genres)];return(l.length>0||u.length>0)&&(r.genres=en(l,u,Kt(n,`genres_match_all`,`true`)===`true`)),await Qt(r,n),r}async function Qt(e,t){let n=Q(t,`tags`),r=Q(t,`tags`,`excluded`),i=zt(qt(t,`tags_text`)),a=dt(),o=new Set(lt()),s=V.filter(e=>o.has(e.id)).flatMap(e=>e.tagIds);if(n.length===0&&r.length===0&&i.included.length===0&&i.excluded.length===0&&a.length===0&&s.length===0)return;let c=await Nt(),l=Ft(c),u=new Set(c.map(e=>e.id)),d=[...Lt(n,l,c),...Rt(i.included,l)].filter(e=>u.has(e)),f=[...Lt(r,l,c),...Rt(i.excluded,l),...Rt(a,l),...s].filter(e=>u.has(e));(d.length>0||f.length>0)&&(e.tags=en(d,f,Kt(t,`tags_match_all`,`true`)===`true`))}function $t(e){if(e===`official`)return[`Official`];if(e===`scanlations`)return[`Unofficial`,`Mixed`]}function en(e,t,n){let r={values:[...new Set(e)]};return n&&(r.match_all=!0),t.length>0&&(r.exclude=[...new Set(t)]),r}function tn(e,t,n){let r=e.source_id?t.get(e.source_id):void 0,i=n&&r?`${e.title.trim()} [${r}]`:e.title.trim(),a=[typeof e.current_books==`number`?`${e.current_books} Chapters`:void 0,e.start_year?String(e.start_year):void 0].filter(e=>!!e);return{mangaId:e.series_id,title:i,imageUrl:M(e.cover_image_id),subtitle:a.join(` - `),contentRating:R(e.content_rating)}}function nn(e,t,n){return{type:`simpleCarouselItem`,mangaId:e.series_id,title:on(e,t,n),imageUrl:M(e.cover_image_id),subtitle:typeof e.current_books==`number`?`${e.current_books} Chapters`:void 0,contentRating:R(e.content_rating)}}function rn(e,t,n){let r=e.latest_chapters?.[0];if(r?.book_id)return{type:`chapterUpdatesCarouselItem`,mangaId:e.series_id,chapterId:r.book_id,title:on(e,t,n),imageUrl:M(e.cover_image_id),subtitle:sn(r.volume_no,r.chapter_no),publishDate:Ve(r.available_at??r.created_at),contentRating:R(e.content_rating)}}function an(e,t,n,r){let i=t?.average_rating??t?.bayesian_rating,a=t?.total_views,o=cn(i,a),s=(t?.series_staff??[]).filter(e=>/author|story/i.test(e.role)).map(e=>e.name);return{type:`featuredCarouselItem`,mangaId:e.series_id,title:on(e,n,r),imageUrl:M(e.cover_image_id),supertitle:z(s),summary:t?.description?.trim()||void 0,infoItems:o,contentRating:R(e.content_rating)}}function on(e,t,n){let r=e.source_id?t.find(t=>t.source_id===e.source_id)?.title:void 0;return n&&r?`${e.title.trim()} [${r}]`:e.title.trim()}function sn(e,t){let n=[e?.trim()?`Vol. ${e.trim()}`:void 0,t?.trim()?`Ch. ${t.trim()}`:void 0].filter(e=>!!e);return n.length>0?n.join(` `):void 0}function cn(e,t){let n=typeof e==`number`&&Number.isFinite(e)?{symbol:`star.fill`,text:`${ln(e)}/10`}:void 0,r=typeof t==`number`&&Number.isFinite(t)?{symbol:`eye.fill`,text:`${un(t)} views`}:void 0;if(n&&r)return[n,r];if(n)return[n];if(r)return[r]}function ln(e){return(e>10?e/10:e).toFixed(1)}function un(e){let t=Math.abs(e);return t>=1e9?`${(e/1e9).toFixed(1)}B`:t>=1e6?`${(e/1e6).toFixed(1)}M`:t>=1e3?`${(e/1e3).toFixed(1)}K`:String(Math.round(e))}let dn=[{id:`popular`,title:`Popular`,type:x.featured},{id:`trending`,title:`Trending`,type:x.genres},{id:`latest`,title:`Latest Updates`,type:x.chapterUpdates},{id:`recently-added`,title:`Recently Added`,type:x.simpleCarousel},{id:`genres`,title:`Genres`,type:x.genres}],fn={popular:`total_views,desc`,latest:`updated_at,desc`,"recently-added":`created_at,desc`},pn=[{title:`Today`,sort:`avg_views_today,desc`},{title:`This Week`,sort:`avg_views_week,desc`},{title:`This Month`,sort:`avg_views_month,desc`},{title:`All Time`,sort:`avg_views,desc`}];var mn=class{async getDiscoverSections(){return dn}async getDiscoverSectionItems(e,t){if(e.id===`trending`)return _n();if(e.id===`genres`)return vn();let n=t?.page??1,r=fn[e.id];if(!r)throw Error(`Unknown discover section: ${e.id}`);let i=await N(),a=await Zt({title:``,metadata:[]},i),o=e.id===`popular`?5:35,s=await D({url:new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`search`).addPathComponent(`series`).setQueryItem(`page`,String(n-1)).setQueryItem(`size`,String(o)).setQueryItem(`sort`,r).toString(),method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(a)}),c=(s.content??[]).filter(De);return{items:await hn(e.id,c,i),metadata:e.id!==`popular`&&s.last===!1?{page:n+1}:void 0}}};async function hn(e,t,n){let r=W();if(e===`popular`){let e=await Promise.all(t.map(e=>gn(e.series_id)));return t.map((t,i)=>an(t,e[i],n.sources,r))}return e===`latest`?t.map(e=>rn(e,n.sources,r)).filter(e=>e!==void 0):t.map(e=>nn(e,n.sources,r))}async function gn(e){try{return await D({url:new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`series`).addPathComponent(e).toString(),method:`GET`})}catch(e){if(e instanceof v)throw e;return}}function _n(){return{items:pn.map(e=>({type:`genresCarouselItem`,name:e.title,searchQuery:{title:``,metadata:[{id:ve,value:e.sort}]}})),metadata:void 0}}async function vn(){return{items:(await P()).filter(e=>!e.genre_type||e.genre_type.toLowerCase()===`genre`).sort((e,t)=>e.genre_name.localeCompare(t.genre_name)).map(e=>({type:`genresCarouselItem`,name:e.genre_name,searchQuery:{title:``,metadata:[{id:`genres`,value:{[e.id]:`included`}}]}})),metadata:void 0}}function yn(e,t,n,r){let i=t.source_id?n?.sources.find(e=>e.source_id===t.source_id)?.title:void 0,a=bn(t,i,r.showEdition,r.showSource),o=(t.series_alternate_titles??[]).map(e=>e.title.trim()).filter(Boolean),s=t.series_staff??[],c=s.filter(e=>/author|story/i.test(e.role)).map(e=>e.name),l=s.filter(e=>/artist|art/i.test(e.role)).map(e=>e.name),u=Sn(t);return{mangaId:e,mangaInfo:{primaryTitle:a,secondaryTitles:o,thumbnailUrl:M(t.series_covers?.[0]?.image_id),synopsis:xn(t,i),author:z(c),artist:z(l),status:He(t.upload_status),contentRating:R(t.content_rating),tagGroups:u,shareUrl:`${S}/series/${e}`}}}function bn(e,t,n,r){let i=e.title.trim(),a=n&&e.edition_info?.trim()?`${i} (${e.edition_info.trim()})`:i;return r&&t?`${a} [${t}]`:a}function xn(e,t){let n=[],r=e.description?.trim();r&&n.push(r),t&&e.source_id&&n.push(`Source: ${t} (${S}/sources/${e.source_id})`);let i=(e.series_alternate_titles??[]).map(e=>e.title.trim()).filter(Boolean);return i.length>0&&n.push(`Associated Names:\n${i.join(`
`)}`),n.join(`

`)}function Sn(e){let t=e.format?.trim()?[{id:Cn(`format`,e.format),title:e.format}]:[],n=(e.genres??[]).map(e=>({id:Cn(`genre`,e.genre_name),title:e.genre_name})),r=(e.tags??[]).map(e=>({id:Cn(`tag`,e.tag_name),title:e.tag_name}));return[...t.length>0||n.length>0?[{id:`genres`,title:`Genres`,tags:[...t,...n]}]:[],...r.length>0?[{id:`tags`,title:`Tags`,tags:r}]:[]]}function Cn(e,t){return`${e}:${encodeURIComponent(t.trim()).replace(/[!'*~]/g,e=>`%${e.charCodeAt(0).toString(16).toUpperCase()}`)||`unknown`}`}var wn=class{async getMangaDetails(e){let t={url:new y(C).addPathComponent(`api`).addPathComponent(`v2`).addPathComponent(`series`).addPathComponent(e).toString(),method:`GET`},[n,r]=await Promise.all([D(t),Tn()]);return yn(e,n,r,{showEdition:tt(),showSource:W()})}};async function Tn(){try{return await N()}catch{return}}var $=class{constructor(){i(this,`cookieStorageInterceptor`,new ue({storage:`stateManager`})),i(this,`globalRateLimiter`,new se(`kagane-rate-limiter`,{numberOfRequests:8,bufferInterval:1,ignoreImages:!0})),i(this,`kaganeInterceptor`,new Te(`kagane-interceptor`))}async initialise(){this.cookieStorageInterceptor.registerInterceptor(),this.kaganeInterceptor.registerInterceptor(),this.globalRateLimiter.registerInterceptor()}async cloudflareBypassCompleted(e,t,n){let r=t.find(e=>e.name===`cf_clearance`);r&&this.cookieStorageInterceptor.setCookie(r)}};return Ee($,[Xt,wn,St,mn,ht]),e.Kagane=new $,e.KaganeExtension=$,e})({});