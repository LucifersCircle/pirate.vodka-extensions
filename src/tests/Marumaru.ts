/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */
import { PaperbackInterceptor, CloudflareError, ContentRating, type Request, type Response, type Chapter, type SourceManga, type Metadata, type TestLogger } from "@paperback/types";
import { expect } from "chai";
import { Marumaru } from "../Marumaru/main";
import { parseListing, parseWork, parseDetail, parseReader, readerURL } from "../Marumaru/MarumaruAPI";
import { MarumaruInterceptor, MarumaruRateLimiter } from "../Marumaru/network";
import { authorizeImage, batchPolicy, nativePolicy, observe } from "../Marumaru/policy";
import { TestSuite } from "./suite";
import { binaryCoverWebP, binaryCoverJPEG } from "../Marumaru/images";

// Inspect only responses actually consumed by the normal source callbacks.
// No saved provider fixture, substituted transport, WebView or extra oracle API.
class Probe extends PaperbackInterceptor {
  requests:Request[]=[];
  json=new Map<string,unknown>();
  images=new Map<string,{response:Response;data:ArrayBuffer}>();
  override async interceptRequest(request:Request):Promise<Request>{this.requests.push(request);return request;}
  override async interceptResponse(request:Request,response:Response,data:ArrayBuffer):Promise<ArrayBuffer>{
    if(response.status===200){
      const mime=Object.entries(response.headers).find(([k])=>k.toLowerCase()==="content-type")?.[1]??"";
      if(/^application\/json(?:;|$)/i.test(mime))this.json.set(request.url,JSON.parse(Application.arrayBufferToUTF8String(data)));
      else this.images.set(request.url,{response,data});
    }
    return data;
  }
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const fail=async(fn:()=>Promise<unknown>,pattern:RegExp)=>{let error:unknown;try{await fn()}catch(e){error=e}expect(String(error)).to.match(pattern);};
const ROOT="https://marumaru105.com",LIST="https://api.storagewebtoon.store/api/v1/reader/A2/works/17155",READER="https://api.storagewebtoon.store/api/v1/reader/A2/episodes/21331";
export async function runTests(logger:TestLogger){
  const suite=new TestSuite("Marumaru native API tests",logger),probe=new Probe("Marumaru.native-test-evidence");
  let catalogReady=false,next:Metadata|undefined,firstIds:string[]=[],catalogCover="",detail:SourceManga|undefined,chapters:Chapter[]|undefined,pages:string[]=[];
  const savedState=Application.getState("Marumaru.imagePolicy.v1");
  suite.test("Native catalog matches one current API response with no per-title requests",async()=>{
    await Marumaru.initialise();probe.registerInterceptor();
    const before=probe.requests.length,result=await Marumaru.getSearchResults({title:""});
    expect(probe.requests.length-before).to.equal(1);
    const url=probe.requests.at(-1)!.url;expect(url).to.equal(`${ROOT}/api/works?mediaType=MANHWA&page=0&size=49`);
    const expected=parseListing(probe.json.get(url),0,false);
    expect(result.items.map(i=>({id:i.mangaId,title:i.title,cover:i.imageUrl}))).to.deep.equal(expected.items.map(i=>({id:i.id,title:i.title,cover:i.cover})));
    for(const item of result.items)expect(item.mangaId).to.match(/^[1-9]\d*$/);
    firstIds=result.items.map(i=>i.mangaId);catalogCover=result.items[0].imageUrl;next=result.metadata;catalogReady=true;
    logger.log("catalogTransport",{requests:1,perTitle:0,count:result.items.length,webView:false});
  });
  suite.test("Native response-scoped catalog continuation advances without overlap",async()=>{
    expect(catalogReady,"Catalog prerequisite; no retry").to.equal(true);expect(next).not.to.equal(undefined);
    const result=await Marumaru.getSearchResults({title:""},next);expect(result.items.length).to.be.greaterThan(0);expect(result.items.some(i=>firstIds.includes(i.mangaId))).to.equal(false);
  });
  suite.test("Native queried API search retains Korean canonical identity",async()=>{
    expect(catalogReady,"Catalog prerequisite; no retry").to.equal(true);const result=await Marumaru.getSearchResults({title:"라멘 아카네코"});expect(result.items.some(i=>i.mangaId==="17155")).to.equal(true);expect(result.metadata).to.equal(undefined);
  });
  suite.test("Native details follow only the source-issued complete episode URL",async()=>{
    expect(catalogReady,"Catalog prerequisite; no retry").to.equal(true);const before=probe.requests.length;detail=await Marumaru.getMangaDetails("17155");
    expect(probe.requests.slice(before).map(r=>r.url)).to.deep.equal([`${ROOT}/api/works/17155`,LIST]);
    expect(detail.mangaInfo.primaryTitle).to.equal("라멘 아카네코");expect(detail.mangaInfo.author).to.equal("안갸맨");expect(detail.mangaInfo.synopsis.length).to.be.greaterThan(0);
  });
  suite.test("Native cached inventory preserves all 103 special labels and SourceManga references",async()=>{
    expect(detail,"Details prerequisite; no retry").not.to.equal(undefined);const before=probe.requests.length;chapters=await Marumaru.getChapters(detail!);expect(probe.requests.length).to.equal(before);
    expect(chapters.length).to.equal(103);expect(chapters[0]?.chapterId).to.equal("1738175");expect(chapters.at(-1)?.chapterId).to.equal("21333");expect(new Set(chapters.map(c=>c.chapterId)).size).to.equal(chapters.length);
    for(const c of chapters){expect(c.sourceManga).to.equal(detail);expect(c.sortingIndex).to.equal(c.chapNum);}
    const special=chapters.find(c=>c.chapterId==="21332");expect(special?.chapNum).to.equal(2);expect(special?.title).to.include("1-2화");
  });
  suite.test("Native 15-chapter title does not require a nonexistent DOM next control",async()=>{
    expect(catalogReady,"Catalog prerequisite; no retry").to.equal(true);const single=await Marumaru.getMangaDetails("21861"),all=await Marumaru.getChapters(single);
    expect(single.mangaInfo.primaryTitle).to.equal("은거 마왕님의 회춘귀환");expect(all.length).to.equal(15);expect(all[0].chapterId).to.equal("3086149");expect(all.at(-1)?.chapterId).to.equal("1385655");for(const c of all)expect(c.sourceManga).to.equal(single);
  });
  suite.test("Native reader preserves the complete 19-image API manifest and real first/last bytes",async()=>{
    expect(chapters,"Inventory prerequisite; no retry").not.to.equal(undefined);const selected=chapters!.find(c=>c.chapterId==="21331");expect(selected).not.to.equal(undefined);
    const result=await Marumaru.getChapterDetails(selected!);if(result.type&&result.type!=="images")throw new Error("Expected image reader");pages=result.pages;
    expect(pages.length).to.equal(19);pages.forEach((url,index)=>expect(url).to.equal(`https://peer.storagewebtoon.store/api/media/episode/21331/${index+1}.webp`));
    const evidence=[];for(const url of [pages[0],pages.at(-1)!]){const[r,b]=await Application.scheduleRequest({url,method:"GET"});expect(r.status).to.equal(200);expect(b.byteLength).to.be.greaterThan(100);evidence.push({page:pages.indexOf(url)+1,bytes:b.byteLength});}logger.log("readerBytes",evidence);
  });
  suite.test("Native advertised catalog and detail covers accept validated binary image framing",async()=>{
    expect(detail,"Details prerequisite; no retry").not.to.equal(undefined);const evidence=[];
    for(const url of new Set([catalogCover,detail!.mangaInfo.thumbnailUrl])){const[r,b]=await Application.scheduleRequest({url,method:"GET"});expect(r.status).to.equal(200);expect(b.byteLength).to.be.greaterThan(100);const mime=Object.entries(r.headers).find(([k])=>k.toLowerCase()==="content-type")?.[1];if(mime?.startsWith("application/octet-stream"))expect(binaryCoverWebP(b)||binaryCoverJPEG(b)).to.equal(true);evidence.push({bytes:b.byteLength,mime});}logger.log("coverBytes",evidence);
  });
  suite.test("Live-derived API mutations reject wrong owners, counts, classification and page gaps",async()=>{
    const before=probe.requests.length;expect(detail).not.to.equal(undefined);expect(pages.length).to.equal(19);
    const raw=probe.json.get(`${ROOT}/api/works/17155`)!;const work=parseWork(raw,"17155");const list=probe.json.get(LIST)!;const ready=parseDetail(work,list);const selected=ready.chapters.find(c=>c.id==="21331")!;const reader=probe.json.get(READER)!;
    expect(()=>parseWork(raw,"21861")).to.throw(/ownership/);const wrong=clone(raw) as any;wrong.episodesUrl=LIST.replace("17155","21861");expect(()=>parseWork(wrong,"17155")).to.throw(/episode-list/);
    const missing=clone(list) as any;missing.episodes.pop();expect(()=>parseDetail(work,missing)).to.throw(/inventory/);
    const duplicate=clone(list) as any;duplicate.episodes[1]=duplicate.episodes[0];expect(()=>parseDetail(work,duplicate)).to.throw(/Duplicate/);
    const other=clone(reader) as any;other.item.work_id=21861;expect(()=>parseReader(other,"17155",selected)).to.throw(/identity/);
    const gap=clone(reader) as any;gap.item.body.splice(3,1);expect(()=>parseReader(gap,"17155",selected)).to.throw(/incomplete/);
    const unready=clone(reader) as any;unready.item.ready=false;expect(()=>parseReader(unready,"17155",selected)).to.throw(/not ready/);
    const catalog=clone(probe.json.get(`${ROOT}/api/works?mediaType=MANHWA&page=0&size=49`)) as any;catalog.items[0].adult="false";expect(()=>parseListing(catalog,0,false)).to.throw(/classification/);
    expect(()=>readerURL(LIST,"21861","21331")).to.throw(/episode-list/);expect(probe.requests.length).to.equal(before);
  });
  suite.test("Binary cover guards reject truncation, wrong length, layout and image ownership",async()=>{
    expect(detail).not.to.equal(undefined);const image=probe.images.get(detail!.mangaInfo.thumbnailUrl)!;expect(image).not.to.equal(undefined);expect(binaryCoverWebP(image.data)).to.equal(true);
    expect(binaryCoverWebP(image.data.slice(0,-1))).to.equal(false);const bad=image.data.slice(0);new Uint8Array(bad)[4]^=1;expect(binaryCoverWebP(bad)).to.equal(false);const chunk=image.data.slice(0);new Uint8Array(chunk)[12]=0;expect(binaryCoverWebP(chunk)).to.equal(false);
    expect(()=>authorizeImage(detail!.mangaInfo.thumbnailUrl.replace("/17155/","/21861/"))).to.throw();
    const catalogImage=probe.images.get(catalogCover)!;expect(catalogImage).not.to.equal(undefined);
    expect(binaryCoverWebP(catalogImage.data)||binaryCoverJPEG(catalogImage.data)).to.equal(true);
    if(binaryCoverJPEG(catalogImage.data)){
      expect(binaryCoverJPEG(catalogImage.data.slice(0,-1))).to.equal(false);
      const trailing=new Uint8Array(catalogImage.data.byteLength+1);trailing.set(new Uint8Array(catalogImage.data));expect(binaryCoverJPEG(trailing.buffer)).to.equal(false);
      const broken=catalogImage.data.slice(0);new Uint8Array(broken)[4]=0;new Uint8Array(broken)[5]=1;expect(binaryCoverJPEG(broken)).to.equal(false);
    }
  });
  suite.test("Issued opaque cover URLs do not occupy the metadata rate queue",async()=>{
    expect(detail).not.to.equal(undefined);
    class CountLimiter extends MarumaruRateLimiter { count=0; override async incrementRequestCount(){this.count++;} }
    const limiter=new CountLimiter("Marumaru.rate-proof",{numberOfRequests:1,bufferInterval:1,ignoreImages:true});
    const request:Request={url:detail!.mangaInfo.thumbnailUrl,method:"GET"};
    expect(await limiter.interceptRequest(request)).to.equal(request);expect(limiter.count).to.equal(0);
    await fail(()=>limiter.interceptRequest({url:request.url+"?unissued=1",method:"GET"}),/not issued/);expect(limiter.count).to.equal(0);
  });
  suite.test("Native empty-cookie shape and genuine challenge signaling remain scoped",async()=>{
    expect(detail).not.to.equal(undefined);const interceptor=new MarumaruInterceptor("Marumaru.offline-response-check"),url=detail!.mangaInfo.thumbnailUrl;
    const request:Request={url,method:"GET",cookies:{}};expect(await interceptor.interceptRequest(request)).to.equal(request);
    await fail(()=>interceptor.interceptRequest({url,method:"GET",cookies:{unexpected:"value"}}),/Unsupported/);
    let error:unknown;try{await interceptor.interceptResponse(request,{url,status:403,headers:{"CF-Mitigated":"challenge"},cookies:[]},new ArrayBuffer(0));}catch(e){error=e}expect(error).to.be.instanceOf(CloudflareError);expect((error as CloudflareError).resolutionRequest.url).to.equal(url);
    await fail(()=>interceptor.interceptResponse(request,{url:url+"?changed=1",status:403,headers:{"cf-mitigated":"challenge"},cookies:[]},new ArrayBuffer(0)),/redirected/);
    await fail(()=>interceptor.interceptResponse(request,{url,status:403,headers:{},cookies:[]},new ArrayBuffer(0)),/failed/);
  });
  suite.test("Native policy persists exact grants and rejects lost or corrupted evidence",async()=>{
    expect(detail).not.to.equal(undefined);const url=detail!.mangaInfo.thumbnailUrl;authorizeImage(url);const raw=Application.getState("Marumaru.imagePolicy.v1");expect(raw).to.be.a("string");
    try{Application.setState(undefined,"Marumaru.imagePolicy.v1");expect(()=>authorizeImage(url)).to.throw();Application.setState('{"version":1}',"Marumaru.imagePolicy.v1");expect(()=>authorizeImage(url)).to.throw();}finally{Application.setState(raw,"Marumaru.imagePolicy.v1");}authorizeImage(url);
    const before=probe.requests.length;await fail(()=>Marumaru.getSearchResults({title:"different"},next),/continuation/);expect(probe.requests.length).to.equal(before);
  });
  suite.test("Explicit adult evidence stays stronger than later sparse classification",async()=>{
    expect(detail).not.to.equal(undefined);const raw=Application.getState("Marumaru.imagePolicy.v1"),at=Date.now();
    try{
      const oldAt=at-5000;
      batchPolicy(()=>{expect(observe("17155",true,oldAt)).to.equal(true);expect(observe("17155",false,at)).to.equal(true);});
      const assertOriginal=()=>expect(JSON.parse(Application.getState("Marumaru.imagePolicy.v1") as string).titles.find((entry:unknown[])=>entry[0]==="17155")).to.deep.equal(["17155",true,oldAt]);
      assertOriginal();
      const found=await Marumaru.getSearchResults({title:"라멘 아카네코"});expect(found.items[0].contentRating).to.equal(ContentRating.ADULT);assertOriginal();
      const current=await Marumaru.getMangaDetails("17155");expect(current.mangaInfo.contentRating).to.equal(ContentRating.ADULT);assertOriginal();
      const selected=chapters!.find(c=>c.chapterId==="21331")!;await Marumaru.getChapterDetails(selected);assertOriginal();
      expect(JSON.parse(nativePolicy())).to.have.length(2);
    }
    finally{Application.setState(raw,"Marumaru.imagePolicy.v1");}
    expect(detail!.mangaInfo.contentRating).to.equal(ContentRating.MATURE);
  });
  try{await suite.run();}finally{probe.unregisterInterceptor();Application.setState(savedState,"Marumaru.imagePolicy.v1");}
}
