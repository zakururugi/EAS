var fe={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Oe=function(e){const t=[];let n=0;for(let r=0;r<e.length;r++){let o=e.charCodeAt(r);o<128?t[n++]=o:o<2048?(t[n++]=o>>6|192,t[n++]=o&63|128):(o&64512)===55296&&r+1<e.length&&(e.charCodeAt(r+1)&64512)===56320?(o=65536+((o&1023)<<10)+(e.charCodeAt(++r)&1023),t[n++]=o>>18|240,t[n++]=o>>12&63|128,t[n++]=o>>6&63|128,t[n++]=o&63|128):(t[n++]=o>>12|224,t[n++]=o>>6&63|128,t[n++]=o&63|128)}return t},ft=function(e){const t=[];let n=0,r=0;for(;n<e.length;){const o=e[n++];if(o<128)t[r++]=String.fromCharCode(o);else if(o>191&&o<224){const i=e[n++];t[r++]=String.fromCharCode((o&31)<<6|i&63)}else if(o>239&&o<365){const i=e[n++],s=e[n++],a=e[n++],c=((o&7)<<18|(i&63)<<12|(s&63)<<6|a&63)-65536;t[r++]=String.fromCharCode(55296+(c>>10)),t[r++]=String.fromCharCode(56320+(c&1023))}else{const i=e[n++],s=e[n++];t[r++]=String.fromCharCode((o&15)<<12|(i&63)<<6|s&63)}}return t.join("")},Ne={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(e,t){if(!Array.isArray(e))throw Error("encodeByteArray takes an array as a parameter");this.init_();const n=t?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let o=0;o<e.length;o+=3){const i=e[o],s=o+1<e.length,a=s?e[o+1]:0,c=o+2<e.length,l=c?e[o+2]:0,u=i>>2,T=(i&3)<<4|a>>4;let O=(a&15)<<2|l>>6,N=l&63;c||(N=64,s||(O=64)),r.push(n[u],n[T],n[O],n[N])}return r.join("")},encodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?btoa(e):this.encodeByteArray(Oe(e),t)},decodeString(e,t){return this.HAS_NATIVE_SUPPORT&&!t?atob(e):ft(this.decodeStringToByteArray(e,t))},decodeStringToByteArray(e,t){this.init_();const n=t?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let o=0;o<e.length;){const i=n[e.charAt(o++)],a=o<e.length?n[e.charAt(o)]:0;++o;const l=o<e.length?n[e.charAt(o)]:64;++o;const T=o<e.length?n[e.charAt(o)]:64;if(++o,i==null||a==null||l==null||T==null)throw new ht;const O=i<<2|a>>4;if(r.push(O),l!==64){const N=a<<4&240|l>>2;if(r.push(N),T!==64){const dt=l<<6&192|T;r.push(dt)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let e=0;e<this.ENCODED_VALS.length;e++)this.byteToCharMap_[e]=this.ENCODED_VALS.charAt(e),this.charToByteMap_[this.byteToCharMap_[e]]=e,this.byteToCharMapWebSafe_[e]=this.ENCODED_VALS_WEBSAFE.charAt(e),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[e]]=e,e>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(e)]=e,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(e)]=e)}}};class ht extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const pt=function(e){const t=Oe(e);return Ne.encodeByteArray(t,!0)},Me=function(e){return pt(e).replace(/\./g,"")},gt=function(e){try{return Ne.decodeString(e,!0)}catch(t){console.error("base64Decode failed: ",t)}return null};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mt(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const bt=()=>mt().__FIREBASE_DEFAULTS__,wt=()=>{if(typeof process>"u"||typeof fe>"u")return;const e=fe.__FIREBASE_DEFAULTS__;if(e)return JSON.parse(e)},yt=()=>{if(typeof document>"u")return;let e;try{e=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const t=e&&gt(e[1]);return t&&JSON.parse(t)},It=()=>{try{return bt()||wt()||yt()}catch(e){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${e}`);return}},Be=()=>{var e;return(e=It())===null||e===void 0?void 0:e.config};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Et{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((t,n)=>{this.resolve=t,this.reject=n})}wrapCallback(t){return(n,r)=>{n?this.reject(n):this.resolve(r),typeof t=="function"&&(this.promise.catch(()=>{}),t.length===1?t(n):t(n,r))}}}function Re(){try{return typeof indexedDB=="object"}catch{return!1}}function Fe(){return new Promise((e,t)=>{try{let n=!0;const r="validate-browser-context-for-indexeddb-analytics-module",o=self.indexedDB.open(r);o.onsuccess=()=>{o.result.close(),n||self.indexedDB.deleteDatabase(r),e(!0)},o.onupgradeneeded=()=>{n=!1},o.onerror=()=>{var i;t(((i=o.error)===null||i===void 0?void 0:i.message)||"")}}catch(n){t(n)}})}function _t(){return!(typeof navigator>"u"||!navigator.cookieEnabled)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const vt="FirebaseError";class A extends Error{constructor(t,n,r){super(n),this.code=t,this.customData=r,this.name=vt,Object.setPrototypeOf(this,A.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,R.prototype.create)}}class R{constructor(t,n,r){this.service=t,this.serviceName=n,this.errors=r}create(t,...n){const r=n[0]||{},o=`${this.service}/${t}`,i=this.errors[t],s=i?St(i,r):"Error",a=`${this.serviceName}: ${s} (${o}).`;return new A(o,a,r)}}function St(e,t){return e.replace(At,(n,r)=>{const o=t[r];return o!=null?String(o):`<${r}?>`})}const At=/\{\$([^}]+)}/g;function G(e,t){if(e===t)return!0;const n=Object.keys(e),r=Object.keys(t);for(const o of n){if(!r.includes(o))return!1;const i=e[o],s=t[o];if(he(i)&&he(s)){if(!G(i,s))return!1}else if(i!==s)return!1}for(const o of r)if(!n.includes(o))return!1;return!0}function he(e){return e!==null&&typeof e=="object"}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ne(e){return e&&e._delegate?e._delegate:e}class w{constructor(t,n,r){this.name=t,this.instanceFactory=n,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(t){return this.instantiationMode=t,this}setMultipleInstances(t){return this.multipleInstances=t,this}setServiceProps(t){return this.serviceProps=t,this}setInstanceCreatedCallback(t){return this.onInstanceCreated=t,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const y="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tt{constructor(t,n){this.name=t,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(t){const n=this.normalizeInstanceIdentifier(t);if(!this.instancesDeferred.has(n)){const r=new Et;if(this.instancesDeferred.set(n,r),this.isInitialized(n)||this.shouldAutoInitialize())try{const o=this.getOrInitializeService({instanceIdentifier:n});o&&r.resolve(o)}catch{}}return this.instancesDeferred.get(n).promise}getImmediate(t){var n;const r=this.normalizeInstanceIdentifier(t==null?void 0:t.identifier),o=(n=t==null?void 0:t.optional)!==null&&n!==void 0?n:!1;if(this.isInitialized(r)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:r})}catch(i){if(o)return null;throw i}else{if(o)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(t){if(t.name!==this.name)throw Error(`Mismatching Component ${t.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=t,!!this.shouldAutoInitialize()){if(Dt(t))try{this.getOrInitializeService({instanceIdentifier:y})}catch{}for(const[n,r]of this.instancesDeferred.entries()){const o=this.normalizeInstanceIdentifier(n);try{const i=this.getOrInitializeService({instanceIdentifier:o});r.resolve(i)}catch{}}}}clearInstance(t=y){this.instancesDeferred.delete(t),this.instancesOptions.delete(t),this.instances.delete(t)}async delete(){const t=Array.from(this.instances.values());await Promise.all([...t.filter(n=>"INTERNAL"in n).map(n=>n.INTERNAL.delete()),...t.filter(n=>"_delete"in n).map(n=>n._delete())])}isComponentSet(){return this.component!=null}isInitialized(t=y){return this.instances.has(t)}getOptions(t=y){return this.instancesOptions.get(t)||{}}initialize(t={}){const{options:n={}}=t,r=this.normalizeInstanceIdentifier(t.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const o=this.getOrInitializeService({instanceIdentifier:r,options:n});for(const[i,s]of this.instancesDeferred.entries()){const a=this.normalizeInstanceIdentifier(i);r===a&&s.resolve(o)}return o}onInit(t,n){var r;const o=this.normalizeInstanceIdentifier(n),i=(r=this.onInitCallbacks.get(o))!==null&&r!==void 0?r:new Set;i.add(t),this.onInitCallbacks.set(o,i);const s=this.instances.get(o);return s&&t(s,o),()=>{i.delete(t)}}invokeOnInitCallbacks(t,n){const r=this.onInitCallbacks.get(n);if(r)for(const o of r)try{o(t,n)}catch{}}getOrInitializeService({instanceIdentifier:t,options:n={}}){let r=this.instances.get(t);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:Ct(t),options:n}),this.instances.set(t,r),this.instancesOptions.set(t,n),this.invokeOnInitCallbacks(r,t),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,t,r)}catch{}return r||null}normalizeInstanceIdentifier(t=y){return this.component?this.component.multipleInstances?t:y:t}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function Ct(e){return e===y?void 0:e}function Dt(e){return e.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class kt{constructor(t){this.name=t,this.providers=new Map}addComponent(t){const n=this.getProvider(t.name);if(n.isComponentSet())throw new Error(`Component ${t.name} has already been registered with ${this.name}`);n.setComponent(t)}addOrOverwriteComponent(t){this.getProvider(t.name).isComponentSet()&&this.providers.delete(t.name),this.addComponent(t)}getProvider(t){if(this.providers.has(t))return this.providers.get(t);const n=new Tt(t,this);return this.providers.set(t,n),n}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var d;(function(e){e[e.DEBUG=0]="DEBUG",e[e.VERBOSE=1]="VERBOSE",e[e.INFO=2]="INFO",e[e.WARN=3]="WARN",e[e.ERROR=4]="ERROR",e[e.SILENT=5]="SILENT"})(d||(d={}));const Ot={debug:d.DEBUG,verbose:d.VERBOSE,info:d.INFO,warn:d.WARN,error:d.ERROR,silent:d.SILENT},Nt=d.INFO,Mt={[d.DEBUG]:"log",[d.VERBOSE]:"log",[d.INFO]:"info",[d.WARN]:"warn",[d.ERROR]:"error"},Bt=(e,t,...n)=>{if(t<e.logLevel)return;const r=new Date().toISOString(),o=Mt[t];if(o)console[o](`[${r}]  ${e.name}:`,...n);else throw new Error(`Attempted to log a message with an invalid logType (value: ${t})`)};class Rt{constructor(t){this.name=t,this._logLevel=Nt,this._logHandler=Bt,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(t){if(!(t in d))throw new TypeError(`Invalid value "${t}" assigned to \`logLevel\``);this._logLevel=t}setLogLevel(t){this._logLevel=typeof t=="string"?Ot[t]:t}get logHandler(){return this._logHandler}set logHandler(t){if(typeof t!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=t}get userLogHandler(){return this._userLogHandler}set userLogHandler(t){this._userLogHandler=t}debug(...t){this._userLogHandler&&this._userLogHandler(this,d.DEBUG,...t),this._logHandler(this,d.DEBUG,...t)}log(...t){this._userLogHandler&&this._userLogHandler(this,d.VERBOSE,...t),this._logHandler(this,d.VERBOSE,...t)}info(...t){this._userLogHandler&&this._userLogHandler(this,d.INFO,...t),this._logHandler(this,d.INFO,...t)}warn(...t){this._userLogHandler&&this._userLogHandler(this,d.WARN,...t),this._logHandler(this,d.WARN,...t)}error(...t){this._userLogHandler&&this._userLogHandler(this,d.ERROR,...t),this._logHandler(this,d.ERROR,...t)}}const Ft=(e,t)=>t.some(n=>e instanceof n);let pe,ge;function Pt(){return pe||(pe=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function $t(){return ge||(ge=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const Pe=new WeakMap,J=new WeakMap,$e=new WeakMap,L=new WeakMap,re=new WeakMap;function Lt(e){const t=new Promise((n,r)=>{const o=()=>{e.removeEventListener("success",i),e.removeEventListener("error",s)},i=()=>{n(p(e.result)),o()},s=()=>{r(e.error),o()};e.addEventListener("success",i),e.addEventListener("error",s)});return t.then(n=>{n instanceof IDBCursor&&Pe.set(n,e)}).catch(()=>{}),re.set(t,e),t}function jt(e){if(J.has(e))return;const t=new Promise((n,r)=>{const o=()=>{e.removeEventListener("complete",i),e.removeEventListener("error",s),e.removeEventListener("abort",s)},i=()=>{n(),o()},s=()=>{r(e.error||new DOMException("AbortError","AbortError")),o()};e.addEventListener("complete",i),e.addEventListener("error",s),e.addEventListener("abort",s)});J.set(e,t)}let Y={get(e,t,n){if(e instanceof IDBTransaction){if(t==="done")return J.get(e);if(t==="objectStoreNames")return e.objectStoreNames||$e.get(e);if(t==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return p(e[t])},set(e,t,n){return e[t]=n,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function Ht(e){Y=e(Y)}function Vt(e){return e===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(t,...n){const r=e.call(j(this),t,...n);return $e.set(r,t.sort?t.sort():[t]),p(r)}:$t().includes(e)?function(...t){return e.apply(j(this),t),p(Pe.get(this))}:function(...t){return p(e.apply(j(this),t))}}function xt(e){return typeof e=="function"?Vt(e):(e instanceof IDBTransaction&&jt(e),Ft(e,Pt())?new Proxy(e,Y):e)}function p(e){if(e instanceof IDBRequest)return Lt(e);if(L.has(e))return L.get(e);const t=xt(e);return t!==e&&(L.set(e,t),re.set(t,e)),t}const j=e=>re.get(e);function F(e,t,{blocked:n,upgrade:r,blocking:o,terminated:i}={}){const s=indexedDB.open(e,t),a=p(s);return r&&s.addEventListener("upgradeneeded",c=>{r(p(s.result),c.oldVersion,c.newVersion,p(s.transaction),c)}),n&&s.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),a.then(c=>{i&&c.addEventListener("close",()=>i()),o&&c.addEventListener("versionchange",l=>o(l.oldVersion,l.newVersion,l))}).catch(()=>{}),a}function H(e,{blocked:t}={}){const n=indexedDB.deleteDatabase(e);return t&&n.addEventListener("blocked",r=>t(r.oldVersion,r)),p(n).then(()=>{})}const Ut=["get","getKey","getAll","getAllKeys","count"],Wt=["put","add","delete","clear"],V=new Map;function me(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if(V.get(t))return V.get(t);const n=t.replace(/FromIndex$/,""),r=t!==n,o=Wt.includes(n);if(!(n in(r?IDBIndex:IDBObjectStore).prototype)||!(o||Ut.includes(n)))return;const i=async function(s,...a){const c=this.transaction(s,o?"readwrite":"readonly");let l=c.store;return r&&(l=l.index(a.shift())),(await Promise.all([l[n](...a),o&&c.done]))[0]};return V.set(t,i),i}Ht(e=>({...e,get:(t,n,r)=>me(t,n)||e.get(t,n,r),has:(t,n)=>!!me(t,n)||e.has(t,n)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Kt{constructor(t){this.container=t}getPlatformInfoString(){return this.container.getProviders().map(n=>{if(qt(n)){const r=n.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(n=>n).join(" ")}}function qt(e){const t=e.getComponent();return(t==null?void 0:t.type)==="VERSION"}const X="@firebase/app",be="0.10.13";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const g=new Rt("@firebase/app"),zt="@firebase/app-compat",Gt="@firebase/analytics-compat",Jt="@firebase/analytics",Yt="@firebase/app-check-compat",Xt="@firebase/app-check",Zt="@firebase/auth",Qt="@firebase/auth-compat",en="@firebase/database",tn="@firebase/data-connect",nn="@firebase/database-compat",rn="@firebase/functions",on="@firebase/functions-compat",sn="@firebase/installations",an="@firebase/installations-compat",cn="@firebase/messaging",un="@firebase/messaging-compat",ln="@firebase/performance",dn="@firebase/performance-compat",fn="@firebase/remote-config",hn="@firebase/remote-config-compat",pn="@firebase/storage",gn="@firebase/storage-compat",mn="@firebase/firestore",bn="@firebase/vertexai-preview",wn="@firebase/firestore-compat",yn="firebase";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Z="[DEFAULT]",In={[X]:"fire-core",[zt]:"fire-core-compat",[Jt]:"fire-analytics",[Gt]:"fire-analytics-compat",[Xt]:"fire-app-check",[Yt]:"fire-app-check-compat",[Zt]:"fire-auth",[Qt]:"fire-auth-compat",[en]:"fire-rtdb",[tn]:"fire-data-connect",[nn]:"fire-rtdb-compat",[rn]:"fire-fn",[on]:"fire-fn-compat",[sn]:"fire-iid",[an]:"fire-iid-compat",[cn]:"fire-fcm",[un]:"fire-fcm-compat",[ln]:"fire-perf",[dn]:"fire-perf-compat",[fn]:"fire-rc",[hn]:"fire-rc-compat",[pn]:"fire-gcs",[gn]:"fire-gcs-compat",[mn]:"fire-fst",[wn]:"fire-fst-compat",[bn]:"fire-vertex","fire-js":"fire-js",[yn]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const M=new Map,En=new Map,Q=new Map;function we(e,t){try{e.container.addComponent(t)}catch(n){g.debug(`Component ${t.name} failed to register with FirebaseApp ${e.name}`,n)}}function E(e){const t=e.name;if(Q.has(t))return g.debug(`There were multiple attempts to register component ${t}.`),!1;Q.set(t,e);for(const n of M.values())we(n,e);for(const n of En.values())we(n,e);return!0}function oe(e,t){const n=e.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),e.container.getProvider(t)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _n={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},m=new R("app","Firebase",_n);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vn{constructor(t,n,r){this._isDeleted=!1,this._options=Object.assign({},t),this._config=Object.assign({},n),this._name=n.name,this._automaticDataCollectionEnabled=n.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new w("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(t){this.checkDestroyed(),this._automaticDataCollectionEnabled=t}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(t){this._isDeleted=t}checkDestroyed(){if(this.isDeleted)throw m.create("app-deleted",{appName:this._name})}}function Le(e,t={}){let n=e;typeof t!="object"&&(t={name:t});const r=Object.assign({name:Z,automaticDataCollectionEnabled:!1},t),o=r.name;if(typeof o!="string"||!o)throw m.create("bad-app-name",{appName:String(o)});if(n||(n=Be()),!n)throw m.create("no-options");const i=M.get(o);if(i){if(G(n,i.options)&&G(r,i.config))return i;throw m.create("duplicate-app",{appName:o})}const s=new kt(o);for(const c of Q.values())s.addComponent(c);const a=new vn(n,r,s);return M.set(o,a),a}function Sn(e=Z){const t=M.get(e);if(!t&&e===Z&&Be())return Le();if(!t)throw m.create("no-app",{appName:e});return t}function b(e,t,n){var r;let o=(r=In[e])!==null&&r!==void 0?r:e;n&&(o+=`-${n}`);const i=o.match(/\s|\//),s=t.match(/\s|\//);if(i||s){const a=[`Unable to register library "${o}" with version "${t}":`];i&&a.push(`library name "${o}" contains illegal characters (whitespace or "/")`),i&&s&&a.push("and"),s&&a.push(`version name "${t}" contains illegal characters (whitespace or "/")`),g.warn(a.join(" "));return}E(new w(`${o}-version`,()=>({library:o,version:t}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const An="firebase-heartbeat-database",Tn=1,C="firebase-heartbeat-store";let x=null;function je(){return x||(x=F(An,Tn,{upgrade:(e,t)=>{switch(t){case 0:try{e.createObjectStore(C)}catch(n){console.warn(n)}}}}).catch(e=>{throw m.create("idb-open",{originalErrorMessage:e.message})})),x}async function Cn(e){try{const n=(await je()).transaction(C),r=await n.objectStore(C).get(He(e));return await n.done,r}catch(t){if(t instanceof A)g.warn(t.message);else{const n=m.create("idb-get",{originalErrorMessage:t==null?void 0:t.message});g.warn(n.message)}}}async function ye(e,t){try{const r=(await je()).transaction(C,"readwrite");await r.objectStore(C).put(t,He(e)),await r.done}catch(n){if(n instanceof A)g.warn(n.message);else{const r=m.create("idb-set",{originalErrorMessage:n==null?void 0:n.message});g.warn(r.message)}}}function He(e){return`${e.name}!${e.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Dn=1024,kn=30*24*60*60*1e3;class On{constructor(t){this.container=t,this._heartbeatsCache=null;const n=this.container.getProvider("app").getImmediate();this._storage=new Mn(n),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){var t,n;try{const o=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),i=Ie();return((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,((n=this._heartbeatsCache)===null||n===void 0?void 0:n.heartbeats)==null)||this._heartbeatsCache.lastSentHeartbeatDate===i||this._heartbeatsCache.heartbeats.some(s=>s.date===i)?void 0:(this._heartbeatsCache.heartbeats.push({date:i,agent:o}),this._heartbeatsCache.heartbeats=this._heartbeatsCache.heartbeats.filter(s=>{const a=new Date(s.date).valueOf();return Date.now()-a<=kn}),this._storage.overwrite(this._heartbeatsCache))}catch(r){g.warn(r)}}async getHeartbeatsHeader(){var t;try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,((t=this._heartbeatsCache)===null||t===void 0?void 0:t.heartbeats)==null||this._heartbeatsCache.heartbeats.length===0)return"";const n=Ie(),{heartbeatsToSend:r,unsentEntries:o}=Nn(this._heartbeatsCache.heartbeats),i=Me(JSON.stringify({version:2,heartbeats:r}));return this._heartbeatsCache.lastSentHeartbeatDate=n,o.length>0?(this._heartbeatsCache.heartbeats=o,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),i}catch(n){return g.warn(n),""}}}function Ie(){return new Date().toISOString().substring(0,10)}function Nn(e,t=Dn){const n=[];let r=e.slice();for(const o of e){const i=n.find(s=>s.agent===o.agent);if(i){if(i.dates.push(o.date),Ee(n)>t){i.dates.pop();break}}else if(n.push({agent:o.agent,dates:[o.date]}),Ee(n)>t){n.pop();break}r=r.slice(1)}return{heartbeatsToSend:n,unsentEntries:r}}class Mn{constructor(t){this.app=t,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Re()?Fe().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const n=await Cn(this.app);return n!=null&&n.heartbeats?n:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(t){var n;if(await this._canUseIndexedDBPromise){const o=await this.read();return ye(this.app,{lastSentHeartbeatDate:(n=t.lastSentHeartbeatDate)!==null&&n!==void 0?n:o.lastSentHeartbeatDate,heartbeats:t.heartbeats})}else return}async add(t){var n;if(await this._canUseIndexedDBPromise){const o=await this.read();return ye(this.app,{lastSentHeartbeatDate:(n=t.lastSentHeartbeatDate)!==null&&n!==void 0?n:o.lastSentHeartbeatDate,heartbeats:[...o.heartbeats,...t.heartbeats]})}else return}}function Ee(e){return Me(JSON.stringify({version:2,heartbeats:e})).length}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Bn(e){E(new w("platform-logger",t=>new Kt(t),"PRIVATE")),E(new w("heartbeat",t=>new On(t),"PRIVATE")),b(X,be,e),b(X,be,"esm2017"),b("fire-js","")}Bn("");var Rn="firebase",Fn="10.14.1";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */b(Rn,Fn,"app");const Ve="@firebase/installations",ie="0.6.9";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xe=1e4,Ue=`w:${ie}`,We="FIS_v2",Pn="https://firebaseinstallations.googleapis.com/v1",$n=60*60*1e3,Ln="installations",jn="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Hn={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},_=new R(Ln,jn,Hn);function Ke(e){return e instanceof A&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qe({projectId:e}){return`${Pn}/projects/${e}/installations`}function ze(e){return{token:e.token,requestStatus:2,expiresIn:xn(e.expiresIn),creationTime:Date.now()}}async function Ge(e,t){const r=(await t.json()).error;return _.create("request-failed",{requestName:e,serverCode:r.code,serverMessage:r.message,serverStatus:r.status})}function Je({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function Vn(e,{refreshToken:t}){const n=Je(e);return n.append("Authorization",Un(t)),n}async function Ye(e){const t=await e();return t.status>=500&&t.status<600?e():t}function xn(e){return Number(e.replace("s","000"))}function Un(e){return`${We} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wn({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const r=qe(e),o=Je(e),i=t.getImmediate({optional:!0});if(i){const l=await i.getHeartbeatsHeader();l&&o.append("x-firebase-client",l)}const s={fid:n,authVersion:We,appId:e.appId,sdkVersion:Ue},a={method:"POST",headers:o,body:JSON.stringify(s)},c=await Ye(()=>fetch(r,a));if(c.ok){const l=await c.json();return{fid:l.fid||n,registrationStatus:2,refreshToken:l.refreshToken,authToken:ze(l.authToken)}}else throw await Ge("Create Installation",c)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xe(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Kn(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const qn=/^[cdef][\w-]{21}$/,ee="";function zn(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=Gn(e);return qn.test(n)?n:ee}catch{return ee}}function Gn(e){return Kn(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function P(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ze=new Map;function Qe(e,t){const n=P(e);et(n,t),Jn(n,t)}function et(e,t){const n=Ze.get(e);if(n)for(const r of n)r(t)}function Jn(e,t){const n=Yn();n&&n.postMessage({key:e,fid:t}),Xn()}let I=null;function Yn(){return!I&&"BroadcastChannel"in self&&(I=new BroadcastChannel("[Firebase] FID Change"),I.onmessage=e=>{et(e.data.key,e.data.fid)}),I}function Xn(){Ze.size===0&&I&&(I.close(),I=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zn="firebase-installations-database",Qn=1,v="firebase-installations-store";let U=null;function se(){return U||(U=F(Zn,Qn,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(v)}}})),U}async function B(e,t){const n=P(e),o=(await se()).transaction(v,"readwrite"),i=o.objectStore(v),s=await i.get(n);return await i.put(t,n),await o.done,(!s||s.fid!==t.fid)&&Qe(e,t.fid),t}async function tt(e){const t=P(e),r=(await se()).transaction(v,"readwrite");await r.objectStore(v).delete(t),await r.done}async function $(e,t){const n=P(e),o=(await se()).transaction(v,"readwrite"),i=o.objectStore(v),s=await i.get(n),a=t(s);return a===void 0?await i.delete(n):await i.put(a,n),await o.done,a&&(!s||s.fid!==a.fid)&&Qe(e,a.fid),a}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ae(e){let t;const n=await $(e.appConfig,r=>{const o=er(r),i=tr(e,o);return t=i.registrationPromise,i.installationEntry});return n.fid===ee?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function er(e){const t=e||{fid:zn(),registrationStatus:0};return nt(t)}function tr(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const o=Promise.reject(_.create("app-offline"));return{installationEntry:t,registrationPromise:o}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},r=nr(e,n);return{installationEntry:n,registrationPromise:r}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:rr(e)}:{installationEntry:t}}async function nr(e,t){try{const n=await Wn(e,t);return B(e.appConfig,n)}catch(n){throw Ke(n)&&n.customData.serverCode===409?await tt(e.appConfig):await B(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function rr(e){let t=await _e(e.appConfig);for(;t.registrationStatus===1;)await Xe(100),t=await _e(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:r}=await ae(e);return r||n}return t}function _e(e){return $(e,t=>{if(!t)throw _.create("installation-not-found");return nt(t)})}function nt(e){return or(e)?{fid:e.fid,registrationStatus:0}:e}function or(e){return e.registrationStatus===1&&e.registrationTime+xe<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ir({appConfig:e,heartbeatServiceProvider:t},n){const r=sr(e,n),o=Vn(e,n),i=t.getImmediate({optional:!0});if(i){const l=await i.getHeartbeatsHeader();l&&o.append("x-firebase-client",l)}const s={installation:{sdkVersion:Ue,appId:e.appId}},a={method:"POST",headers:o,body:JSON.stringify(s)},c=await Ye(()=>fetch(r,a));if(c.ok){const l=await c.json();return ze(l)}else throw await Ge("Generate Auth Token",c)}function sr(e,{fid:t}){return`${qe(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ce(e,t=!1){let n;const r=await $(e.appConfig,i=>{if(!rt(i))throw _.create("not-registered");const s=i.authToken;if(!t&&ur(s))return i;if(s.requestStatus===1)return n=ar(e,t),i;{if(!navigator.onLine)throw _.create("app-offline");const a=dr(i);return n=cr(e,a),a}});return n?await n:r.authToken}async function ar(e,t){let n=await ve(e.appConfig);for(;n.authToken.requestStatus===1;)await Xe(100),n=await ve(e.appConfig);const r=n.authToken;return r.requestStatus===0?ce(e,t):r}function ve(e){return $(e,t=>{if(!rt(t))throw _.create("not-registered");const n=t.authToken;return fr(n)?Object.assign(Object.assign({},t),{authToken:{requestStatus:0}}):t})}async function cr(e,t){try{const n=await ir(e,t),r=Object.assign(Object.assign({},t),{authToken:n});return await B(e.appConfig,r),n}catch(n){if(Ke(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await tt(e.appConfig);else{const r=Object.assign(Object.assign({},t),{authToken:{requestStatus:0}});await B(e.appConfig,r)}throw n}}function rt(e){return e!==void 0&&e.registrationStatus===2}function ur(e){return e.requestStatus===2&&!lr(e)}function lr(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+$n}function dr(e){const t={requestStatus:1,requestTime:Date.now()};return Object.assign(Object.assign({},e),{authToken:t})}function fr(e){return e.requestStatus===1&&e.requestTime+xe<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function hr(e){const t=e,{installationEntry:n,registrationPromise:r}=await ae(t);return r?r.catch(console.error):ce(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function pr(e,t=!1){const n=e;return await gr(n),(await ce(n,t)).token}async function gr(e){const{registrationPromise:t}=await ae(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mr(e){if(!e||!e.options)throw W("App Configuration");if(!e.name)throw W("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw W(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function W(e){return _.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ot="installations",br="installations-internal",wr=e=>{const t=e.getProvider("app").getImmediate(),n=mr(t),r=oe(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:r,_delete:()=>Promise.resolve()}},yr=e=>{const t=e.getProvider("app").getImmediate(),n=oe(t,ot).getImmediate();return{getId:()=>hr(n),getToken:o=>pr(n,o)}};function Ir(){E(new w(ot,wr,"PUBLIC")),E(new w(br,yr,"PRIVATE"))}Ir();b(Ve,ie);b(Ve,ie,"esm2017");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Er="/firebase-messaging-sw.js",_r="/firebase-cloud-messaging-push-scope",it="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",vr="https://fcmregistrations.googleapis.com/v1",st="google.c.a.c_id",Sr="google.c.a.c_l",Ar="google.c.a.ts",Tr="google.c.a.e";var Se;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(Se||(Se={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var D;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"})(D||(D={}));/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function h(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function Cr(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),r=atob(n),o=new Uint8Array(r.length);for(let i=0;i<r.length;++i)o[i]=r.charCodeAt(i);return o}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const K="fcm_token_details_db",Dr=5,Ae="fcm_token_object_Store";async function kr(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(i=>i.name).includes(K))return null;let t=null;return(await F(K,Dr,{upgrade:async(r,o,i,s)=>{var a;if(o<2||!r.objectStoreNames.contains(Ae))return;const c=s.objectStore(Ae),l=await c.index("fcmSenderId").get(e);if(await c.clear(),!!l){if(o===2){const u=l;if(!u.auth||!u.p256dh||!u.endpoint)return;t={token:u.fcmToken,createTime:(a=u.createTime)!==null&&a!==void 0?a:Date.now(),subscriptionOptions:{auth:u.auth,p256dh:u.p256dh,endpoint:u.endpoint,swScope:u.swScope,vapidKey:typeof u.vapidKey=="string"?u.vapidKey:h(u.vapidKey)}}}else if(o===3){const u=l;t={token:u.fcmToken,createTime:u.createTime,subscriptionOptions:{auth:h(u.auth),p256dh:h(u.p256dh),endpoint:u.endpoint,swScope:u.swScope,vapidKey:h(u.vapidKey)}}}else if(o===4){const u=l;t={token:u.fcmToken,createTime:u.createTime,subscriptionOptions:{auth:h(u.auth),p256dh:h(u.p256dh),endpoint:u.endpoint,swScope:u.swScope,vapidKey:h(u.vapidKey)}}}}}})).close(),await H(K),await H("fcm_vapid_details_db"),await H("undefined"),Or(t)?t:null}function Or(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Nr="firebase-messaging-database",Mr=1,k="firebase-messaging-store";let q=null;function at(){return q||(q=F(Nr,Mr,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(k)}}})),q}async function Br(e){const t=ct(e),r=await(await at()).transaction(k).objectStore(k).get(t);if(r)return r;{const o=await kr(e.appConfig.senderId);if(o)return await ue(e,o),o}}async function ue(e,t){const n=ct(e),o=(await at()).transaction(k,"readwrite");return await o.objectStore(k).put(t,n),await o.done,t}function ct({appConfig:e}){return e.appId}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Rr={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used."},f=new R("messaging","Messaging",Rr);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Fr(e,t){const n=await de(e),r=ut(t),o={method:"POST",headers:n,body:JSON.stringify(r)};let i;try{i=await(await fetch(le(e.appConfig),o)).json()}catch(s){throw f.create("token-subscribe-failed",{errorInfo:s==null?void 0:s.toString()})}if(i.error){const s=i.error.message;throw f.create("token-subscribe-failed",{errorInfo:s})}if(!i.token)throw f.create("token-subscribe-no-token");return i.token}async function Pr(e,t){const n=await de(e),r=ut(t.subscriptionOptions),o={method:"PATCH",headers:n,body:JSON.stringify(r)};let i;try{i=await(await fetch(`${le(e.appConfig)}/${t.token}`,o)).json()}catch(s){throw f.create("token-update-failed",{errorInfo:s==null?void 0:s.toString()})}if(i.error){const s=i.error.message;throw f.create("token-update-failed",{errorInfo:s})}if(!i.token)throw f.create("token-update-no-token");return i.token}async function $r(e,t){const r={method:"DELETE",headers:await de(e)};try{const i=await(await fetch(`${le(e.appConfig)}/${t}`,r)).json();if(i.error){const s=i.error.message;throw f.create("token-unsubscribe-failed",{errorInfo:s})}}catch(o){throw f.create("token-unsubscribe-failed",{errorInfo:o==null?void 0:o.toString()})}}function le({projectId:e}){return`${vr}/projects/${e}/registrations`}async function de({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function ut({p256dh:e,auth:t,endpoint:n,vapidKey:r}){const o={web:{endpoint:n,auth:t,p256dh:e}};return r!==it&&(o.web.applicationPubKey=r),o}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Lr=7*24*60*60*1e3;async function jr(e){const t=await Vr(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:h(t.getKey("auth")),p256dh:h(t.getKey("p256dh"))},r=await Br(e.firebaseDependencies);if(r){if(xr(r.subscriptionOptions,n))return Date.now()>=r.createTime+Lr?Hr(e,{token:r.token,createTime:Date.now(),subscriptionOptions:n}):r.token;try{await $r(e.firebaseDependencies,r.token)}catch(o){console.warn(o)}return Te(e.firebaseDependencies,n)}else return Te(e.firebaseDependencies,n)}async function Hr(e,t){try{const n=await Pr(e.firebaseDependencies,t),r=Object.assign(Object.assign({},t),{token:n,createTime:Date.now()});return await ue(e.firebaseDependencies,r),n}catch(n){throw n}}async function Te(e,t){const r={token:await Fr(e,t),createTime:Date.now(),subscriptionOptions:t};return await ue(e,r),r.token}async function Vr(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Cr(t)})}function xr(e,t){const n=t.vapidKey===e.vapidKey,r=t.endpoint===e.endpoint,o=t.auth===e.auth,i=t.p256dh===e.p256dh;return n&&r&&o&&i}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ce(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return Ur(t,e),Wr(t,e),Kr(t,e),t}function Ur(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const r=t.notification.body;r&&(e.notification.body=r);const o=t.notification.image;o&&(e.notification.image=o);const i=t.notification.icon;i&&(e.notification.icon=i)}function Wr(e,t){t.data&&(e.data=t.data)}function Kr(e,t){var n,r,o,i,s;if(!t.fcmOptions&&!(!((n=t.notification)===null||n===void 0)&&n.click_action))return;e.fcmOptions={};const a=(o=(r=t.fcmOptions)===null||r===void 0?void 0:r.link)!==null&&o!==void 0?o:(i=t.notification)===null||i===void 0?void 0:i.click_action;a&&(e.fcmOptions.link=a);const c=(s=t.fcmOptions)===null||s===void 0?void 0:s.analytics_label;c&&(e.fcmOptions.analyticsLabel=c)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qr(e){return typeof e=="object"&&!!e&&st in e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function zr(e){if(!e||!e.options)throw z("App Configuration Object");if(!e.name)throw z("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const r of t)if(!n[r])throw z(r);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function z(e){return f.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Gr{constructor(t,n,r){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;const o=zr(t);this.firebaseDependencies={app:t,appConfig:o,installations:n,analyticsProvider:r}}_delete(){return Promise.resolve()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Jr(e){try{e.swRegistration=await navigator.serviceWorker.register(Er,{scope:_r}),e.swRegistration.update().catch(()=>{})}catch(t){throw f.create("failed-service-worker-registration",{browserErrorMessage:t==null?void 0:t.message})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Yr(e,t){if(!t&&!e.swRegistration&&await Jr(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw f.create("invalid-sw-registration");e.swRegistration=t}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Xr(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=it)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function lt(e,t){if(!navigator)throw f.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw f.create("permission-blocked");return await Xr(e,t==null?void 0:t.vapidKey),await Yr(e,t==null?void 0:t.serviceWorkerRegistration),jr(e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Zr(e,t,n){const r=Qr(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(r,{message_id:n[st],message_name:n[Sr],message_time:n[Ar],message_device_time:Math.floor(Date.now()/1e3)})}function Qr(e){switch(e){case D.NOTIFICATION_CLICKED:return"notification_open";case D.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function eo(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;e.onMessageHandler&&n.messageType===D.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(Ce(n)):e.onMessageHandler.next(Ce(n)));const r=n.data;qr(r)&&r[Tr]==="1"&&await Zr(e,n.messageType,r)}const De="@firebase/messaging",ke="0.12.12";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const to=e=>{const t=new Gr(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>eo(t,n)),t},no=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:r=>lt(t,r)}};function ro(){E(new w("messaging",to,"PUBLIC")),E(new w("messaging-internal",no,"PRIVATE")),b(De,ke),b(De,ke,"esm2017")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function oo(){try{await Fe()}catch{return!1}return typeof window<"u"&&Re()&&_t()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function io(e,t){if(!navigator)throw f.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function so(e=Sn()){return oo().then(t=>{if(!t)throw f.create("unsupported-browser")},t=>{throw f.create("indexed-db-unsupported")}),oe(ne(e),"messaging").getImmediate()}async function ao(e,t){return e=ne(e),lt(e,t)}function co(e,t){return e=ne(e),io(e,t)}ro();let S=null,te=null;function uo(){const e='{"apiKey":"AIzaSyCPlJEwmVvFn8uJWyJCsJrdfiUi-MAaY24","authDomain":"earthquake-alert-system-de65f.firebaseapp.com","projectId":"earthquake-alert-system-de65f","storageBucket":"earthquake-alert-system-de65f.firebasestorage.app","messagingSenderId":"318850794102","appId":"1:318850794102:web:27d44528361bc2f9d59557","measurementId":"G-9DMX6RCV8G"}',t="BPdhV_tWDvJyxCyuZuByZiGGncH3L-bECycGBXNe5ITjtXGJdXvwfLNr7YYsl3RyYSrXhT-ClQlxy86Ml0SDN-U";console.log("[FCM] Checking env vars:"),console.log("[FCM]   VITE_FIREBASE_CONFIG exists:",!0),console.log("[FCM]   VITE_FIREBASE_CONFIG length:",(e==null?void 0:e.length)||0),console.log("[FCM]   VITE_FIREBASE_VAPID_KEY exists:",!0),console.log("[FCM]   VITE_FIREBASE_VAPID_KEY length:",(t==null?void 0:t.length)||0);try{const n=JSON.parse(e);return console.log("[FCM] Firebase config parsed successfully. Project:",n.projectId),n}catch(n){return console.error("[FCM] Failed to parse VITE_FIREBASE_CONFIG:",n.message),null}}function lo(){if(S)return!0;const e=uo();if(!e)return!1;try{const t=Le(e);return S=so(t),console.log("[FCM] Firebase initialized successfully. Project:",e.projectId),co(S,n=>{if(console.log("[FCM] Foreground message received:",n),te)te(n);else{const{title:r,body:o}=n.notification||{};r&&"Notification"in window&&Notification.permission==="granted"&&new Notification(r,{body:o,icon:"/icons/icon-192x192.png",requireInteraction:!0})}}),!0}catch(t){return console.error("[FCM] Firebase initialization failed:",t.message),!1}}async function fo(e){if(!S&&!lo())return console.error("[FCM] Cannot get token: Firebase not initialized. Check VITE_FIREBASE_CONFIG"),{token:null,permission:"unavailable"};if(!("Notification"in window))return console.warn("[FCM] This browser does not support notifications"),{token:null,permission:"unsupported"};if(!e)return console.error("[FCM] VAPID key is empty! Cannot get FCM token."),console.error("[FCM] Set VITE_FIREBASE_VAPID_KEY in your environment variables."),{token:null,permission:"no_vapid"};try{const t=await Notification.requestPermission();if(console.log("[FCM] Notification permission result:",t),t!=="granted")return{token:null,permission:t};const n=await ao(S,{vapidKey:e,serviceWorkerRegistration:await navigator.serviceWorker.ready});return n?(console.log("[FCM] Token obtained successfully, length:",n.length),{token:n,permission:t}):(console.warn("[FCM] No token returned (permission may be blocked)"),{token:null,permission:t})}catch(t){return console.error("[FCM] Error getting token:",t.message),{token:null,permission:"error"}}}function ho(e){te=e}function po(){return S}export{po as getMessagingInstance,lo as initFirebase,ho as onForegroundMessage,fo as requestFcmToken};
