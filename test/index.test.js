var feed    = require('../')
  , should  = require('should')
  , connect = require('connect')
  , _       = require('underscore')
  , fs      = require('fs');


// Serve the fixtures.
connect()
  .use(connect.static(__dirname + "/fixtures"))
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
    { atom:        load_fixture("atom.xml")
    , rss:         load_fixture("rss.xml")
    , google_news: load_fixture("google-news.rss")
    , techcrunch:  load_fixture("techcrunch.rss")
    };


describe("feed", function() {
  describe("fetching a single feed", function() {
    var articles;
    before(function(done) {
      feed(host + "/atom.xml", function(err, _articles) {
        articles = _articles;
        done(err);
      });
    });
    
    it("is an Array", function() {
        articles.should.be.an.instanceof(Array);
    });
    
    it("contains articles", function() {
      articles[0].title.should.eql("Save file on blur");
    });
    
    it("attaches the feed to each article", function() {
      articles[0].feed.source.should.eql(host + "/atom.xml");
      articles[0].feed.name.should.eql("DJG");
    });
  });
  
  it("can fetch multiple urls", function(done) {
    feed([host + "/atom.xml", host + "/rss.xml"], function(err, articles) {
      if (err) return done(err);
      articles.should.be.an.instanceof(Array);
      _.each(articles, function(art) {
        art.title.should.be.a("string");
        art.feed.source.should.include(host);
      });
      done();
    });
  });
  
  
  describe(".identify", function() {
    it("identifies ATOM", function() {
      feed.identify(fixtures.atom).should.eql("atom");
    });
    
    it("identifies RSS", function() {
      feed.identify(fixtures.rss).should.eql("rss");
    });
    
    it("is false when neither", function() {
      feed.identify("hi there").should.be_false;
    });
  });
  
  
  describe(".atom", function() {
    var articles;
    before(function(done) {
      feed.atom(fixtures.atom, function(err, arts) {
        articles = arts;
        done(err);
      });
    });
    
    it("is an Array of articles", function() {
      articles.should.be.an.instanceof(Array);
      articles[0].should.be.an.instanceof(Object);
    });
    
    it("has a title", function() {
      articles[0].title.should.eql("Save file on blur");
    });
    
    it("has an author", function() {
      articles[0].author.should.eql("DJG");
    });
    
    it("has a link", function() {
      articles[0].link.should.eql("http://sentientwaffle.github.com/save-file-on-blur");
    });
    
    it("has content", function() {
      articles[0].content.should.include("Installing the plugin");
    });
    
    it("has a published date", function() {
      articles[0].published.should.be.an.instanceof(Date);
    });
    
    it("has a feed", function() {
      articles[0].feed.name.should.eql("DJG");
      articles[0].feed.link.should.eql("http://sentientwaffle.github.com/");
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
        articles.should.be.an.instanceof(Array);
        articles[0].should.be.an.instanceof(Object);
      });
      
      it("has a title", function() {
        articles[0].title.should.eql("What’s Inside the Box?");
      });
      
      it("has an author", function() {
        articles[0].author.should.eql("Cory Doctorow");
      });
      
      it("has a link", function() {
        articles[0].link.should.eql("http://craphound.com/?p=3911");
      });
      
      it("has content", function() {
        articles[0].content.should.include("Here's a podcast of my last");
        articles[0].content.should.include("John Taylor Williams is a full-time");
      });
      
      it("has a published date", function() {
        articles[0].published.should.be.an.instanceof(Date);
      });
      
      it("has a feed", function() {
        articles[0].feed.name.should.eql("Cory Doctorow's craphound.com");
        articles[0].feed.link.should.eql("http://craphound.com");
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
        articles[0].title.should.eql("Goldman's Blankfein hit hard on CDO conflicts - MarketWatch");
      });
      
      it("has a published date", function() {
        var date = articles[0].published;
        date.getDate().should.eql(27);
        date.getMonth().should.eql(3);
        date.getFullYear().should.eql(2010);
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
        articles[0].title.should.eql("Sexy IPOs Versus SaaS-y IPOs");
      });
      
      it("filters out all <script> tags", function() {
        articles.forEach(function(article) {
          article.content.should.not.match(/<script/i);
        });
      });
      
      it("includes <li> elements", function() {
        var li = false;
        articles.forEach(function(article) {
          if (~article.content.indexOf('<li>')) li = true;
        });
        li.should.be.true;
      });
      
      it("has an author", function() {
        articles[0].author.should.eql("Contributor");
      });
      
      it("attaches the feed metadata to each article", function() {
        articles[0].feed.name.should.eql("TechCrunch");
        articles[0].feed.link.should.eql("http://techcrunch.com");
      });
    });
  });
});
