const request = require('request')
const sax = require('sax')
const _ = require('underscore')

const TYPE_ATOM = "atom"
const TYPE_RSS = "rss"

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
const FeedRead = module.exports = function(feedUrl, callback) {
  if (feedUrl instanceof Array) {
    let feedUrls = feedUrl
    let articles  = []
    const next = function(i) {
      let feedUrl = feedUrls[i];
      if (!feedUrl) return callback(null, articles)
      FeedRead.get(feedUrl, function(err, _articles) {
        if (err) return callback(err)
        articles = articles.concat(_articles)
        next(i + 1)
      })
    };
    next(0)
  }
  else {
    FeedRead.get(feedUrl, callback)
  }
};


// Public: Check if the XML is RSS, ATOM, or neither.
//
// xml - A String of XML.
//
// Returns "atom", "rss", or false when it is neither.
FeedRead.identify = function(xml) {
  if (/<(rss|rdf)\b/i.test(xml)) {
    return TYPE_RSS
  }
  else if (/<feed\b/i.test(xml)) {
    return TYPE_ATOM
  }
  else {
    return false
  }
}



// Internal: Get a single feed.
//
// feedUrl - String url.
// callback - Receives `(err, articles)`.
//
FeedRead.get = function(feedUrl, callback) {
  request(feedUrl, { timeout: 5000 }, function(err, res, body) {
    if (err) {
      return callback(err)
    }
    const type = FeedRead.identify(body)
    if (type == TYPE_ATOM) {
      FeedRead.atom(body, feedUrl, callback)
    }
    else if (type == TYPE_RSS) {
      FeedRead.rss(body, feedUrl, callback)
    }
    else {
      return callback(new Error("Body is not RSS or ATOM", `<${feedUrl}>`, res.statusCode))
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
  if (!callback) {
    return FeedRead.atom(xml, "", source)
  }

  const parser = new FeedParser()
  let articles = []
  // Info about the feed itself, not an article.
  let meta = { source: source }
  // The current article.
  let article = null
  // The author for when no author is specified for the post.
  let defaultAuthor = null

  parser.onopentag = function(tag) {
    if (tag.name == "entry") {
      article = tag
    }
  };

  parser.onclosetag = function(tagname, currentTag) {
    if (tagname == "entry") {
      articles.push(article)
      article = null
    }
    else if (tagname == "author" && !article) {
      defaultAuthor = childData(currentTag, "name")
    }
    else if (tagname == "link" && currentTag.attributes.rel != "self") {
      meta.link || (meta.link = currentTag.attributes.href)
    }
    else if (tagname == "title" && !currentTag.parent.parent) {
      meta.name = currentTag.children[0]
    }
  };

  parser.onend = function() {
    callback(null, _.filter(_.map(articles,
      function(art) {
        if (!art.children.length) {
          return false
        }
        let author = childByName(art, "author")
        if (author) {
          author = childData(author, "name")
        }

        let obj = {
          title:     childData(art, "title"),
          content:   scrubHtml(childData(art, "content")),
          published: childData(art, "published") || childData(art, "updated"),
          author:    author || defaultAuthor,
          link:      childByName(art, "link").attributes.href,
          feed:      meta
        }
        if (obj.published) {
          obj.published = new Date(obj.published)
        }
        return obj
      }
    ), function(art) { return !!art; }));
  };

  parser.write(xml)
};


// Public: Parse the articles from some RSS.
//
// xml      - A XML String.
// source   - (optional)
// callback - Receives `(err, articles)`.
//
// Returns an Array of Articles.
FeedRead.rss = function(xml, source, callback) {
  if (!callback) return FeedRead.rss(xml, "", source)

  const parser   = new FeedParser()
  let articles = []
  // Info about the feed itself, not an article.
  let meta = { source: source}
  // The current article.
  let article = null


  parser.onopentag = function(tag) {
    if (tag.name == "item") {
      article = tag
    }
  };

  parser.onclosetag = function(tagname, current_tag) {
    if (tagname == "item") {
      articles.push(article)
      article = null
    }
    else if (tagname == "channel") {
      meta.link || (meta.link = childData(current_tag, "link"))
      meta.name = childData(current_tag, "title")
    }
  };

  parser.onend = function() {
    callback(null, _.filter(_.map(articles,
      function(art) {
        if (!art.children.length) {
          return false
        }
        let obj = {
          title:     childData(art, "title"),
          content:
            scrubHtml(childData(art, "content:encoded")) || scrubHtml(childData(art, "description")),
          published: childData(art, "pubDate"),
          author:    childData(art, "author") || childData(art, "dc:creator"),
          link:      childData(art, "link"),
          feed:      meta
        }
        if (obj.published) {
          obj.published = new Date(obj.published)
        }
        return obj
      }
    ), function(art) { return !!art }));
  };

  parser.write(xml)
};


// Methods to override:
//
//   * onopentag
//   * onclosetag
//   * onend
//
const FeedParser = (function() {
  // Internal: Parse the XML.
  //
  // xml      - An XML String.
  // callback - Receives `(err, obj)`.
  //
  function FeedParser() {
    this.current_tag = null
    let saxParserOptions = {
      trim: true,
      normalize: true
    }
    let parser = this.parser = sax.parser(true, saxParserOptions)
    let _this  = this

    parser.onopentag  = function(tag) { _this.open(tag); }
    parser.onclosetag = function(tag) { _this.close(tag); }

    parser.onerror = function() { this.error = undefined; }
    parser.ontext  = function(text) { _this.ontext(text); }
    parser.oncdata = function(text) { _this.ontext(text); }
    parser.onend   = function() { _this.onend(); }
  }


  // Public: Parse the XML.
  FeedParser.prototype.write = function(xml) {
    this.parser.write(xml).close()
  };

  // Internal: Open a tag.
  FeedParser.prototype.open = function(tag) {
    tag.parent   = this.current_tag
    tag.children = []
    if (tag.parent) {
      tag.parent.children.push(tag)
    }
    this.current_tag = tag
    this.onopentag(tag)
  };

  // Internal: Close a tag.
  FeedParser.prototype.close = function(tagname) {
    this.onclosetag(tagname, this.current_tag)
    if (this.current_tag && this.current_tag.parent) {
      let p = this.current_tag.parent
      delete this.current_tag.parent
      this.current_tag = p
    }
  };

  // Internal: Add the text as a child of the current tag.
  FeedParser.prototype.ontext = function(text) {
    if (this.current_tag) {
      this.current_tag.children.push(text)
    }
  };

  return FeedParser
})();


// Internal: Remove <script> tags from the HTML.
//
// html     - An HTML String.
// callback - Receives `(err, html)`.
//
// TODO: Do actual HTML parsing!!
function scrubHtml(html) {
  return html.replace(/<script.*<\/script>/gi, "")
}


// Internal: Find the first node from the parent node's children that has
// the given name.
//
// parent - An Array of node objects.
// name   - String node name.
//
// Returns a node Object or null.
function childByName(parent, name) {
  let children = parent.children || []
  for (let i = 0; i < children.length; i++) {
    if (children[i].name == name) {
      return children[i]
    }
  }
  return null
}

// Internal: Get the first child of `parent` with `name`,
// and return the text of its children.
function childData(parent, name) {
  let node = childByName(parent, name)
  if (!node) {
    return ""
  }
  let children = node.children
  if (!children.length) {
    return ""
  }
  return children.join("")
}
