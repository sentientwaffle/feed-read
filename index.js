var request    = require('request')
  , sax        = require('sax')
  , _          = require('underscore');


// Public: Fetch the articles from the RSS or ATOM feed.
// 
// url      - The String feed url, or an Array of urls.
// callback - Receives `(err, articles)`, where each article has properties:
//          
//              * "title"
//              * "author"
//              * "link"
//              * "content"
//              * "published"
//              * "feed" - {name, source, link}
// 
// Returns nothing.
var FeedRead = module.exports = function(feed_url, callback) {
  if (feed_url instanceof Array) {
    var feed_urls = feed_url
      , articles  = [];
    var next = function(i) {
      var feed_url = feed_urls[i];
      if (!feed_url) return callback(null, articles);
      FeedRead.get(feed_url, function(err, _articles) {
        if (err) return callback(err);
        articles = articles.concat(_articles);
        next(i + 1);
      });
    };
    next(0);
  } else {
    FeedRead.get(feed_url, callback);
  }
};


// Public: Check if the XML is RSS, ATOM, or neither.
// 
// xml - A String of XML.
// 
// Returns "atom", "rss", or false when it is neither.
FeedRead.identify = function(xml) {
  if (/<rss /i.test(xml)) {
    return "rss";
  } else if (/<feed /i.test(xml)) {
    return "atom";
  } else {
    return false;
  }
}



// Internal: Get a single feed.
// 
// feed_url - String url.
// callback - Receives `(err, articles)`.
// 
FeedRead.get = function(feed_url, callback) {
  request(feed_url, function(err, res, body) {
    if (err) return callback(err);
    var type = FeedRead.identify(body);
    if (type == "atom") {
      FeedRead.atom(body, feed_url, callback);
    } else if (type == "rss") {
      FeedRead.rss(body, feed_url, callback);
    } else {
      return callback(new Error( "Body is not RSS or ATOM"
                                , body.substr(0, 30), "..."));
    }
  });
};



// Public: Parse the articles from some ATOM.
// 
// xml      - A XML String.
// source   - (optional)
// callback - Receives `(err, articles)`.
// 
// Returns an Array of Articles.
FeedRead.atom = function(xml, source, callback) {
  if (!callback) return FeedRead.atom(xml, "", source);
  
  var parser   = new FeedParser()
    , articles = []
    // Info about the feed itself, not an article.
    , meta     = {source: source}
    // The current article.
    , article
    // The author for when no author is specified for the post.
    , default_author;
  
  
  parser.onopentag = function(tag) {
    if (tag.name == "entry") article = tag;
  };
  
  parser.onclosetag = function(tagname, current_tag) {
    if (tagname == "entry") {
      articles.push(article);
      article = null;
    } else if (tagname == "author" && !article) {
      default_author = child_data(current_tag, "name");
    } else if (tagname == "link" && current_tag.attributes.rel != "self") {
      meta.link || (meta.link = current_tag.attributes.href);
    } else if (tagname == "title" && !current_tag.parent.parent) {
      meta.name = current_tag.children[0];
    }
  };
  
  parser.onend = function() {
    callback(null, _.map(articles,
      function(art) {
        var author = child_by_name(art, "author");
        if (author) author = child_data(author, "name");
        
        var obj = {
            title:     child_data(art, "title")
          , content:   child_data(art, "content")
          , published: child_data(art, "published")
                    || child_data(art, "updated")
          , author:    author || default_author
          , link:      child_by_name(art, "link").attributes.href
          , feed:      meta
          };
        if (obj.published) obj.published = new Date(obj.published);
        return obj;
      }
    ));
  };
  
  parser.write(xml);
};


// Public: Parse the articles from some RSS.
// 
// xml      - A XML String.
// source   - (optional)
// callback - Receives `(err, articles)`.
// 
// Returns an Array of Articles.
FeedRead.rss = function(xml, source, callback) {
  if (!callback) return FeedRead.rss(xml, "", source);
  
  var parser   = new FeedParser()
    , articles = []
    // Info about the feed itself, not an article.
    , meta     = {source: source}
    // The current article.
    , article;
  
  
  parser.onopentag = function(tag) {
    if (tag.name == "item") article = tag;
  };
  
  parser.onclosetag = function(tagname, current_tag) {
    if (tagname == "item") {
      articles.push(article);
      article = null;
    } else if (tagname == "channel") {
      meta.link || (meta.link = child_data(current_tag, "link"));
      meta.name = child_data(current_tag, "title");
    }
  };
  
  parser.onend = function() {
    callback(null, _.map(articles,
      function(art) {
        var obj = {
            title:     child_data(art, "title")
          , content:   scrub_html(child_data(art, "content:encoded"))
                    || scrub_html(child_data(art, "description"))
          , published: child_data(art, "pubDate")
          , author:    child_data(art, "author")
                    || child_data(art, "dc:creator")
          , link:      child_data(art, "link")
          , feed:      meta
          };
        if (obj.published) obj.published = new Date(obj.published);
        return obj;
      }
    ));
  };
  
  parser.write(xml);
};


// Methods to override:
// 
//   * onopentag
//   * onclosetag
//   * onend
// 
var FeedParser = (function() {
  // Internal: Parse the XML.
  // 
  // xml      - An XML String.
  // callback - Receives `(err, obj)`.
  // 
  function FeedParser() {
    this.current_tag = null;
    var parser       = this.parser = sax.parser(true,
        { trim: true
        , normalize: true
        })
      , _this        = this;
    
    parser.onopentag  = function(tag) { _this.open(tag); };
    parser.onclosetag = function(tag) { _this.close(tag); };
    
    parser.ontext  = function(text) { _this.ontext(text); };
    parser.oncdata = function(text) { _this.ontext(text); };
    parser.onend   = function() { _this.onend(); };
    
    parser.onerror = console.error;
  }
  
  
  // Public: Parse the XML.
  FeedParser.prototype.write = function(xml) {
    this.parser.write(xml).close();
  };
  
  // Internal: Open a tag.
  FeedParser.prototype.open = function(tag) {
    tag.parent   = this.current_tag;
    tag.children = [];
    if (tag.parent) tag.parent.children.push(tag);
    this.current_tag = tag;
    this.onopentag(tag);
  };
  
  // Internal: CLose a tag.
  FeedParser.prototype.close = function(tagname) {
    this.onclosetag(tagname, this.current_tag);
    if (this.current_tag && this.current_tag.parent) {
      var p = this.current_tag.parent;
      delete this.current_tag.parent;
      this.current_tag = p;
    }
  };
  
  // Internal: Add the text as a child of the current tag.
  FeedParser.prototype.ontext = function(text) {
    if (this.current_tag) {
      this.current_tag.children.push(text);
    }
  };
  
  return FeedParser;
})();


// Internal: Remove <script> tags from the HTML.
// 
// html     - An HTML String.
// callback - Receives `(err, html)`.
// 
// TODO: Do actual HTML parsing!!
function scrub_html(html) {
  return html.replace(/<script.*<\/script>/gi, "");
}


// Internal: Find the first node from the parent node's children that has
// the given name.
// 
// parent - An Array of node objects.
// name   - String node name.
// 
// Returns a node Object or null.
function child_by_name(parent, name) {
  var children = parent.children || [];
  for (var i = 0; i < children.length; i++) {
    if (children[i].name == name) return children[i];
  }
  return null;
}

// Internal: Get the first child of `parent` with `name`,
// and return the text of its children.
function child_data(parent, name) {
  var node     = child_by_name(parent, name)
  if (!node) return "";
  var children = node.children;
  if (!children.length) return "";
  return children.join("");
}
