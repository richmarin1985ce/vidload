import test from "node:test";
import assert from "node:assert/strict";
import {parseXUrl,isTrustedMp4,extractMedia} from "../src/worker.js";
test("parse X URLs with tracking parameters",()=>{
  assert.deepEqual(parseXUrl("https://x.com/softiealiaa/status/2124566142220218582?a=123"),{username:"softiealiaa",id:"2124566142220218582"});
  assert.equal(parseXUrl("https://evil.example/softiealiaa/status/2124566142220218582"),null);
  assert.equal(parseXUrl("https://x.com.evil.example/user/status/2124566142220218582"),null);
});
test("only stream MP4 from validated CDN",()=>{
  assert.equal(isTrustedMp4("https://video.twimg.com/vid/720x720/test.mp4?tag=1"),true);
  assert.equal(isTrustedMp4("https://video.twimg.com.evil.example/test.mp4"),false);
  assert.equal(isTrustedMp4("https://video.twimg.com:8080/vid/test.mp4"),false);
});
test("extract and sort public formats",()=>{
  const x=extractMedia({tweet:{text:"example",media:{videos:[{url:"https://video.twimg.com/vid/720x720/test.mp4",thumbnail_url:"https://pbs.twimg.com/abc.jpg"},{url:"https://video.twimg.com/vid/1080x1080/test.mp4"}]}}});
  assert.equal(x.sources.length,2);
  assert.match(x.sources[0].quality,/1080p/);
  assert.equal(x.preview,"https://pbs.twimg.com/abc.jpg");
});
