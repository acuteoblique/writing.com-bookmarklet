// http://www.writing.com/main/interact/item_id/1570942-Step-Family-Shrink/map/1
// http://www.writing.com/main/interact/item_id/1687626-A-Giantess-Genie/map/15
function arrayFrom(arrayLike) {
	var length = arrayLike.length;
	var array = [];
	for (var index = 0; index < length; ++index) {
		array.push(arrayLike[index]);
	}
	return array;
}

function Deferral() {
	var that = this;
	this.complete = null;
	this.fail = null;
	this.progress = null;

	this.promise = new Promise(function (complete, fail, progress) {
		that.complete = complete;
		that.fail = fail;
		that.progress = progress;
	});
}

function resolveAfterTimeoutAsync(ms) {
    var deferral = new Deferral();

    setTimeout(function () {
        deferral.complete();
    }, ms);

    return deferral.promise;
}

function getDocumentFromUriAsync(uri, iframe) {
	console.log("getting document from: " + uri);
	var deferral = new Deferral();

	// var iframe = document.createElement("iframe");
	iframe = iframe || document.createElement("iframe");

	iframe.addEventListener("load", function () {
		console.log("iframe loading: " + iframe.src);
		setTimeout(function () {
			var doc = (iframe.contentWindow || iframe.contentDocument).document;
			console.log("completing deferral: " + doc);
			deferral.complete({
				document: doc,
				close: function () {
					iframe.parentElement.removeChild(iframe);
				}
			});
		}, 100);
	});

	iframe.style.display = "none";
	iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
	document.body.appendChild(iframe);
	iframe.src = uri;

	console.log("appending iframe");

	return deferral.promise;
}

var pageUriToPageContentCache = {};

var pageContentIframe = document.createElement("iframe");
function getPageContentFromPageUriAsync(pageUri) {
    if (pageUriToPageContentCache[pageUri]) {
        return Promise.resolve(pageUriToPageContentCache[pageUri]);
    } else {
	    return getDocumentFromUriAsync(pageUri, pageContentIframe).then(function (doc) {
	    	var deferral = new Deferral();

	    	function pollStoryDiv() {
	    		var storyDiv = doc.document.querySelector(".KonaBody");
	    		if (storyDiv) {
	    			var storyHtml = storyDiv.innerHTML;
	    			var storyOptions = arrayFrom(doc.document.querySelectorAll("#myChoices a")).filter(function (a) {
	    				return !a.nextElementSibling || a.nextElementSibling.innerHTML !== "<b>*</b>";
	    			}).map(function (a) {
	    				return { 
	    					href: a.href,
	    					textContent: a.textContent
	    				};
	    			});

                    var result = {
	    				html: storyHtml,
	           			options: storyOptions
                    };

                    pageUriToPageContentCache[pageUri] = result;

	    			deferral.complete(result);
	    		} else {
	    			setTimeout(pollStoryDiv, 100);
	    		}
	    	}

	    	pollStoryDiv();
	    	return deferral.promise;
	    });
    }
}

function getOutlineFromStoryOutlineUriAsync(storyOutlineUri) {
	return getDocumentFromUriAsync(storyOutlineUri).then(function (doc) {
		var as = arrayFrom(doc.document.querySelectorAll("pre")).map(function (pre) {
			return arrayFrom(pre.querySelectorAll("a")).map(function (a) {
				return { 
					href: a.href,
                    textContent: a.textContent
				};
			});
		}).reduce(function (left, right) { return left.concat(right); }, []);
		doc.close();

		if (as.length) {
			var firstALength = as[0].href.length;
			as.forEach(function (a) {
				a.depth = a.href.length - firstALength;
			});

			as.forEach(function (a, aIndex) {
				a.children = [];
				for (var curIndex = aIndex + 1; curIndex < as.length; ++curIndex) {
					if (as[curIndex].depth === a.depth + 1) {
						a.children.push(as[curIndex]);
                        as[curIndex].parent = a;
					} else if (as[curIndex].depth <= a.depth) {
						break;
					}
				}
			});

			function setMaxDepth(entry) {
				var maxDepth = 1;
				if (entry.maxDepth !== undefined) {
					maxDepth = entry.maxDepth;
				} else {
					maxDepth = 1 + entry.children.map(setMaxDepth).reduce(function (left, right) {
						return left < right ? right : left;
					}, 1);
					entry.maxDepth = maxDepth;
				}
				return maxDepth;
			}
			setMaxDepth(as[0]);

			function setTotalChildren(entry) {
				var totalChildren = 1;
				if (entry.totalChildren !== undefined) {
					totalChildren = entry.totalChildren;
				} else {
					totalChildren = entry.children.map(setTotalChildren).reduce(function (left, right) {
						return left + right;
					}, 1);
					entry.totalChildren = totalChildren;
				}
				return totalChildren;
			}
			setTotalChildren(as[0]);
		}

		return as;
	});
}

function createContentDiv() {
    var contentDiv = document.getElementById("writingComBookmarkletContent");
    var contentDivDisplay = "flex";

    if (contentDiv) {
        contentDiv.style.display = contentDiv.style.display === contentDivDisplay ? "none" : contentDivDisplay;
    } else {
    	var contentDiv = document.createElement("div");
        contentDiv.id = "writingComBookmarkletContent";
    	contentDiv.style.minHeight = "100%";
    	contentDiv.style.minWidth = "100%";
    	contentDiv.style.zIndex = "9999";
    	contentDiv.style.position = "absolute";
    	contentDiv.style.display = contentDivDisplay;
    	contentDiv.style.left = "0px";
    	contentDiv.style.top = "0px";
    	contentDiv.style.background = "white";
    	document.body.appendChild(contentDiv);
    	
    	var contentTocDiv = document.createElement("div");
    	contentDiv.appendChild(contentTocDiv);
    	var contentPageDiv = document.createElement("div");
    	contentDiv.appendChild(contentPageDiv);
    	
    	var uriToEntry = { };

        function getEntryFromUri(uri) {
            return uriToEntry[uri] || { 
                maxDepth: 0,
                depth: 0,
                children: [],
                totalChildren: 0,
                parent: null
            };
        }

        function addPageContentFromPageUriAsync(pageUri) {
    		return getPageContentFromPageUriAsync(pageUri).then(function (pageContent) {
    			contentPageDiv.innerHTML += pageContent.html;
    	
    			var list = document.createElement("ul");
    			contentPageDiv.appendChild(list);
    	
    			pageContent.options.sort(function (left, right) {
                    var rightMaxDepth = 0;
                    var leftMaxDepth = 0;

                    if (!uriToEntry[right.href]) {
                        console.error("Missing uriToEntry for " + right.href);
                    } else {
                        rightMaxDepth = uriToEntry[right.href].maxDepth;
                    }
                    if (!uriToEntry[left.href]) {
                        console.error("Missing uriToEntry for " + left.href);
                    } else {
                        leftMaxDepth = uriToEntry[left.href].maxDepth;
                    }
    				return rightMaxDepth - leftMaxDepth;
    			}).map(function (option) {
    				var a = document.createElement("li");
    				var entry = getEntryFromUri(option.href);
    	
    				a.textContent = option.textContent + " (" + entry.maxDepth + ", " + entry.totalChildren + ")";
    	
    				a.addEventListener("click", (function (uri) {
    					loadPageContentFromPageUriAsync(uri);
    				}).bind(null, option.href));
    				return a;
    			}).forEach(function (a) {
    				list.appendChild(a);
    			});
    		});
        }
    
    	function loadPageContentFromPageUriAsync(pageUri) {
            var maxDepthEntry = getEntryFromUri(pageUri);
            while (maxDepthEntry.children && maxDepthEntry.children.length) {
                maxDepthEntry = maxDepthEntry.children.reduce(function (left, right) {
                    var result = left || right;
                    if (left && right) {
                        result = left.maxDepth > right.maxDepth ? left : right;
                    }
                    return result;
                });
            }

            var entries = [];
            do {
                entries.push(maxDepthEntry);
                maxDepthEntry = maxDepthEntry.parent;
            } while (maxDepthEntry);

            var uris = entries.reverse().map(function (entry) {
                return entry.href;
            });

            contentPageDiv.innerHTML = "";

            return uris.map(function (uri) { 
                return function () {
                    return addPageContentFromPageUriAsync(uri);
                };
            }).reduce(function (prev, cur) { 
                return prev.then(function () {
                    return resolveAfterTimeoutAsync(0);
                }).then(cur); 
            }, Promise.resolve());
    	}
    
    	try {
    		var storyOutlineLink = arrayFrom(document.querySelectorAll("a")).filter(function (a) { return a.textContent === "Story Outline"; })[0];
    		if (storyOutlineLink) {
    			var storyOutlineUri = storyOutlineLink.href;
    			getOutlineFromStoryOutlineUriAsync(storyOutlineUri).then(function (outline) {
    				outline.forEach(function (entry) {
    					uriToEntry[entry.href] = entry;
    				});
    
    				contentTocDiv.innerHTML = "";
                    var title = document.createElement("h2");
                    title.textContent = "TOC";
                    title.addEventListener("click", function () {
                        var curDisplay = document.getElementById("tocList").style.display;
                        document.getElementById("tocList").style.display = curDisplay === "none" ? "block" : "none";
                    });
                    contentTocDiv.appendChild(title);
    
    				var curDepth = -1;
    				var curElement = contentTocDiv;
    				for (var index = 0; index < outline.length; ++index) {
    					if (outline[index].depth > curDepth) {
    						var list = document.createElement("ul");
                            list.id = "tocList";
    						curElement.appendChild(list);
    						curElement = list;
    					} else if (outline[index].depth < curDepth) {
    						for (var depthDiff = outline[index].depth; depthDiff < curDepth; ++depthDiff) {
    							curElement = curElement.parentElement;
    						}
    					}
    					curDepth = outline[index].depth;
    
    					var a = document.createElement("li");
    					var entry = outline[index];
                        a.className = "tocEntry";
                        a.id = entry.href;

    					a.textContent = entry.textContent + " (" + entry.maxDepth + ", " + entry.totalChildren + ")";
    					a.addEventListener("click", (function (uri) {
    						loadPageContentFromPageUriAsync(uri);
    					}).bind(null, entry.href));
    					curElement.appendChild(a);
    				}
    			});
    		}
    	
    	}
    	catch (e) {
    		console.error("failure caught: " + e.message + "\n\t" + e.stack);
    	}
    }
}

createContentDiv();

