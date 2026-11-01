import test from 'node:test';
import assert from 'node:assert/strict';
import {renderArticle,articleDisplayImages,type ArticleDocument,type ArticleImage} from '../../gallery-core/src/article.ts';
test('article photo anchors follow authorized resolved photos, including groups, and remain unique',()=>{
  const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222';
  const album='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',group='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',unavailable='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const image=(photoId:string):ArticleImage=>({photoId,src:'/valid-preview',preview:'/valid-preview',alt:'Photo'});
  const doc:ArticleDocument={schemaVersion:1,doc:{type:'doc',content:[
    {type:'galleryImage',attrs:{kind:'photo',ref:one,album}},
    {type:'galleryImageGroup',attrs:{kind:'group',ref:group,album}},
    {type:'galleryImage',attrs:{kind:'photo',ref:unavailable,album}},
  ]}};
  const resolve=(node:{attrs?:Record<string,unknown>})=>node.attrs?.ref===one?image(one):node.attrs?.ref===group?{...image(two),items:[image(one),image(two)]}:null;
  const html=renderArticle(doc,resolve);
  assert.equal(html.split(`id="photo-${one}"`).length-1,1,'repeat appearances have one stable target');
  assert.match(html,new RegExp(`id="photo-${two}" data-article-image="2" data-group-start="1" data-group-size="2"`));
  assert.equal(articleDisplayImages(doc,resolve)[2]!.photoId,two,'viewer index matches the anchor target');
  assert.equal(articleDisplayImages(doc,resolve)[3],null,'unavailable refs do not gain a target or bytes');
  assert.doesNotMatch(renderArticle(doc,()=>image('bad" onclick="evil')),/id="photo-/);
});
