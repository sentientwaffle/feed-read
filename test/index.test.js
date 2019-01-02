var feed    = require('../')
  , should  = require('should')
  , connect = require('connect')
  , static = require('serve-static')
  , _       = require('underscore')
  , fs      = require('fs');


// Serve the fixtures.
connect()
  .use(static(__dirname + "/fixtures"))
  .listen(4478);

var host = "http://127.0.0.1:4478";


// Internal: Load the fixture with the given file name from the
// fixtures directory.
// 
// name - Such as "rss.xml".
// 
// Returns String fixture data.
function load_fixture(name) {
  return fs.readFileSync(__dirname +"/fixtures/"+ name).toString()
}

var fixtures =
  { atom:         load_fixture("atom.xml")
  , atom_invalid: load_fixture("atom-invalid.xml")
  , rss:          load_fixture("rss.xml")
  , google_news:  load_fixture("google-news.rss")
  , techcrunch:   load_fixture("techcrunch.rss")
  };


describe("feed", function() {
  describe("fetching a single feed", function() {
    describe("local", function() {
      var articles;
      before(function(done) {
        feed(host + "/atom.xml", function(err, _articles) {
          articles = _articles;
          done(err);
        });
      });
      
      it("is an Array", function() {
        should(articles).be.an.instanceof(Array);
      });
      
      it("contains articles", function() {
        should(articles[0].title).eql("Save file on blur");
      });
      
      it("attaches the feed to each article", function() {
        should(articles[0].feed.source).eql(host + "/atom.xml");
        should(articles[0].feed.name).eql("DJG");
      });
    });
    
    describe("with redirects", function() {
      var articles;
      before(function(done) {
        feed("http://googleplusplatform.blogspot.com/feeds/posts/default"
        , function(err, _articles) {
          articles = _articles;
          done(err);
        });
      });
      
      it("is an Array of articles", function() {
        should(articles).be.an.instanceof(Array);
        should(articles[0].title).be.a.String();
      });
    });
  });

  it("handles RDF as RSS", function(done) {
    feed("http://rss.slashdot.org/Slashdot/slashdot", function(err, articles) {
      should.not.exist(err);
      should(articles).be.an.instanceof(Array);
      done();
    });
  });
  
  it("can fetch multiple urls", function(done) {
    feed([host + "/atom.xml", host + "/rss.xml"], function(err, articles) {
      if (err) return done(err);
      should(articles).be.an.instanceof(Array);
      _.each(articles, function(art) {
        should(art.title).be.a.String();
        should(art.feed.source).containEql(host);
      });
      done();
    });
  });
  
  
  describe(".identify", function() {
    it("identifies ATOM", function() {
      should(feed.identify(fixtures.atom)).eql("atom");
    });
    
    it("identifies RSS", function() {
      should(feed.identify(fixtures.rss)).eql("rss");
    });
    
    it("is false when neither", function() {
      should(feed.identify("hi there")).be_false;
    });
  });
  
  
  describe(".atom", function() {
    describe("valid XML", function() {
      var articles;
      before(function(done) {
        feed.atom(fixtures.atom, function(err, arts) {
          articles = arts;
          done(err);
        });
      });
      
      it("is an Array of articles", function() {
        should(articles).be.an.instanceof(Array);
        should(articles[0]).be.an.instanceof(Object);
      });
      
      it("has a title", function() {
        should(articles[0].title).eql("Save file on blur");
      });
      
      it("has an author", function() {
        should(articles[0].author).eql("DJG");
      });
      
      it("has a link", function() {
        should(articles[0].link).eql("http://sentientwaffle.github.com/save-file-on-blur");
      });
      
      it("has content", function() {
        should(articles[0].content).containEql("Installing the plugin");
      });
      
      it("has a published date", function() {
        should(articles[0].published).be.an.instanceof(Date);
      });
      
      it("has a feed", function() {
        should(articles[0].feed.name).eql("DJG");
        should(articles[0].feed.link).eql("http://sentientwaffle.github.com/");
      });
    });
    
    describe("invalid XML", function() {
      it("doesn't crash on invalid XML", function(done) {
        feed.atom(fixtures.atom_invalid, function(err, arts) {
          should.not.exist(err);
          should(arts).be.an.instanceof(Array);
          done();
        });
      });
    });
  });
  
  
  describe(".rss", function() {
    describe("a simple RSS feed", function() {
      var articles;
      before(function(done) {
        feed.rss(fixtures.rss, function(err, arts) {
          articles = arts;
          done(err);
        });
      });
      
      it("is an Array of articles", function() {
        should(articles).be.an.instanceof(Array);
        should(articles[0]).be.an.instanceof(Object);
      });
      
      it("has a title", function() {
        should(articles[0].title).eql("What’s Inside the Box?");
      });
      
      it("has an author", function() {
        should(articles[0].author).eql("Cory Doctorow");
      });
      
      it("has a link", function() {
        should(articles[0].link).eql("http://craphound.com/?p=3911");
      });
      
      it("has content", function() {
        should(articles[0].content).containEql("Here's a podcast of my last");
        should(articles[0].content).containEql("John Taylor Williams is a full-time");
      });
      
      it("has a published date", function() {
        should(articles[0].published).be.an.instanceof(Date);
      });
      
      it("has a feed", function() {
        should(articles[0].feed.name).eql("Cory Doctorow's craphound.com");
        should(articles[0].feed.link).eql("http://craphound.com");
      });
    });
    
    describe("a google news RSS feed", function() {
      var articles;
      before(function(done) {
        feed.rss(fixtures.google_news, function(err, arts) {
          articles = arts;
          done(err);
        });
      });
      
      it("has a title", function() {
        should(articles[0].title).eql("Goldman's Blankfein hit hard on CDO conflicts - MarketWatch");
      });
      
      it("has a published date", function() {
        var date = articles[0].published;
        should(date.getDate()).eql(27);
        should(date.getMonth()).eql(3);
        should(date.getFullYear()).eql(2010);
      });
    });
    
    describe("a TechCrunch RSS feed", function() {
      var articles;
      before(function(done) {
        feed.rss(fixtures.techcrunch, function(err, arts) {
          articles = arts;
          done(err);
        });
      });
      
      it("has a title", function() {
        should(articles[0].title).eql("Sexy IPOs Versus SaaS-y IPOs");
      });
      
      it("filters out all <script> tags", function() {
        articles.forEach(function(article) {
          should(article.content).not.match(/<script/i);
        });
      });
      
      it("includes <li> elements", function() {
        var li = false;
        articles.forEach(function(article) {
          if (~article.content.indexOf('<li>')) li = true;
        });
        should(li).be.true;
      });
      
      it("has an author", function() {
        should(articles[0].author).eql("Contributor");
      });
      
      it("attaches the feed metadata to each article", function() {
        should(articles[0].feed.name).eql("TechCrunch");
        should(articles[0].feed.link).eql("http://techcrunch.com");
      });
    });
  });
});
