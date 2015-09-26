// http://www.writing.com/main/interact/item_id/1570942-Step-Family-Shrink/map/1
//
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

function getDocumentFromUriAsync(uri) {
	console.log("getting document from: " + uri);
	var deferral = new Deferral();
	var iframe = document.createElement("iframe");

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

	iframe.src = uri;
	iframe.style.display = "none";
	iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

	console.log("appending iframe");
	document.body.appendChild(iframe);

	return deferral.promise;
}

function getPageContentFromPageUriAsync(pageUri) {
	return getDocumentFromUriAsync(pageUri).then(function (doc) {
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

				deferral.complete({
					html: storyHtml,
	       				options: storyOptions
				});
			} else {
				setTimeout(pollStoryDiv, 1000);
			}
		}

		pollStoryDiv();
		return deferral.promise;
	});
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
	var contentDiv = document.createElement("div");
	contentDiv.style.minHeight = "100%";
	contentDiv.style.width = "100%";
	contentDiv.style.zIndex = "9999";
	contentDiv.style.position = "absolute";
	contentDiv.style.display = "flex";
	contentDiv.style.left = "0px";
	contentDiv.style.top = "0px";
	contentDiv.style.background = "white";
	document.body.appendChild(contentDiv);
	
	var contentTocDiv = document.createElement("div");
	contentDiv.appendChild(contentTocDiv);
	var contentPageDiv = document.createElement("div");
	contentDiv.appendChild(contentPageDiv);
	
	var uriToEntry = { };

	function loadPageContentFromPageUriAsync(pageUri) {
		return getPageContentFromPageUriAsync(pageUri).then(function (pageContent) {
			contentPageDiv.innerHTML = "";
			contentPageDiv.innerHTML = pageContent.html;
	
			var list = document.createElement("ul");
			contentPageDiv.appendChild(list);
	
			pageContent.options.sort(function (left, right) {
				return uriToEntry[right.href].maxDepth - uriToEntry[left.href].maxDepth;
			}).map(function (option) {
				var a = document.createElement("li");
				var entry = uriToEntry[option.href];
	
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

	try {
		var storyOutlineLink = arrayFrom(document.querySelectorAll("a")).filter(function (a) { return a.textContent === "Story Outline"; })[0];
		if (storyOutlineLink) {
			var storyOutlineUri = storyOutlineLink.href;
			getOutlineFromStoryOutlineUriAsync(storyOutlineUri).then(function (outline) {
				outline.forEach(function (entry) {
					uriToEntry[entry.href] = entry;
				});

				contentTocDiv.innerHTML = "";

				var curDepth = -1;
				var curElement = contentTocDiv;
				for (var index = 0; index < outline.length; ++index) {
					if (outline[index].depth > curDepth) {
						var list = document.createElement("ul");
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
					a.textContent = entry.textContent + "(" + entry.maxDepth + ", " + entry.totalChildren + ")";
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

createContentDiv();

