Zotero.PaperMachines = {
	DB: null,
	schema: {
		'files_to_extract': "CREATE TABLE files_to_extract (filename VARCHAR(255), itemID INTEGER, outfile VARCHAR(255), collection VARCHAR(255), UNIQUE(filename, itemID) ON CONFLICT IGNORE);",
		'doc_files': "CREATE TABLE doc_files (itemID INTEGER PRIMARY KEY, filename VARCHAR(255));",
		'collections': "CREATE TABLE collections (id INTEGER PRIMARY KEY, parent VARCHAR(255), child VARCHAR(255), FOREIGN KEY(parent) REFERENCES collection_docs(collection), FOREIGN KEY(child) REFERENCES collection_docs(collection), UNIQUE(parent, child) ON CONFLICT IGNORE);",
		'collection_docs': "CREATE TABLE collection_docs (id INTEGER PRIMARY KEY, collection VARCHAR(255), itemID INTEGER, FOREIGN KEY(itemID) REFERENCES doc_files(itemID), UNIQUE(collection, itemID) ON CONFLICT IGNORE);",
		'processed_collections': "CREATE TABLE processed_collections (id INTEGER PRIMARY KEY, process_path VARCHAR(255), collection VARCHAR(255), processor VARCHAR(255), status VARCHAR(255), progressfile VARCHAR(255), outfile VARCHAR(255), timeStamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(collection) REFERENCES collection_docs(collection), UNIQUE(process_path) ON CONFLICT REPLACE); CREATE TRIGGER insert_processed_collections_timeStamp AFTER INSERT ON processed_collections BEGIN UPDATE processed_collections SET timeStamp = DATETIME('NOW') WHERE rowid = new.rowid; END; CREATE TRIGGER update_processed_collections_timeStamp AFTER UPDATE ON processed_collections BEGIN UPDATE processed_collections SET timeStamp = DATETIME('NOW') WHERE rowid = new.rowid; END;",
		'datasets': "CREATE TABLE datasets (id INTEGER PRIMARY KEY, type VARCHAR(255), path VARCHAR(255))"
	},
	processQuery: "SELECT * FROM processed_collections WHERE process_path = ?;",
	pm_dir: null,
	csv_dir: null,
	extract_dir: null,
	extract_csv_dir: null,
	out_dir: null,
	log_dir: null,
	props_dir: null,
	args_dir: null,
	install_dir: null,
	tagCloudReplace: true,
	processors_dir: null,
	java_exe: null,
	jython_path: null,
	processors: ["wordcloud", "ngrams", "phrasenet", "mallet", "geoparser", "dbpedia", "view-output", "export-output", "reset-output", "export-text"], // "mallet_classify",
	processNames: null, // see locale files
	prompts: null,
	paramLabels: null,
	lang: null,
	experimentalFeatures: ["mallet_dmr", "mallet_dmr_jstor", "mallet_classify", "mallet_lda_MI"],
	wordcloudFilters: [{"name": "none (raw frequency)", "label": " ", "value": "plain", "default": true},
				{"name": "tf*idf", "label": " ", "value": "tfidf"},
				{"name": "Dunning's log-likelihood", "label": " ", "value": "dunning"},
				{"name": "Mann-Whitney U", "label": " ", "value": "mww"},
	],
	processesThatPrompt: {
		"mallet_classify-file": function () {
			// get list of classifiers
			var classifiers = [];
			var classifiedCollections = Zotero.PaperMachines.DB.columnQuery("SELECT collection FROM processed_collections WHERE status = 'done' AND processor='mallet_train-classifier';");
			classifiedCollections.forEach(function (collection) {
				// var classifier = Zotero.PaperMachines.out_dir.clone();
				// classifier.append("mallet_train-classifier" + collection);
				// classifier.append("trained.classifier");
				var classifier = OS.Path.join(Zotero.PaperMachines.out_dir,"mallet_train-classifier" + collection,"trained.classifier");
				console.log('classifier',classifier)
				if (classifier.exists()) {
					classifiers.push({"name": Zotero.PaperMachines.getNameOfGroup(collection), "label": " ", "value": classifier.path});
				}
			})
			return Zotero.PaperMachines.selectFromOptions("mallet_classify-file", classifiers);
		},
		"ngrams": function () {
			var params = Zotero.PaperMachines.promptForProcessParams("ngrams");
			if (params) {
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"wordcloud_translate": function () {
			var params = Zotero.PaperMachines.promptForProcessParams("wordcloud_translate");
			if (params) {
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"wordcloud_translate_multiple": function () {
			var filter = Zotero.PaperMachines.selectFromOptions("wordcloud_multiple", Zotero.PaperMachines.wordcloudFilters);
			if (!filter) return false;

			var params = Zotero.PaperMachines.promptForProcessParams("wordcloud_translate");
			if (params) {
				return filter.concat(["json", JSON.stringify(params)]);
			} else {
				return false;
			}
		},
		"wordcloud_chronological": function () {
			var filter = Zotero.PaperMachines.selectFromOptions("wordcloud_multiple", Zotero.PaperMachines.wordcloudFilters);
			if (!filter) return false;

			var params = Zotero.PaperMachines.promptForProcessParams("wordcloud_chronological");
			if (params) {
				return filter.concat(["json", JSON.stringify(params)]);
			} else {
				return false;
			}
		},
		"mallet_lda_jstor": function () {
			var argArray = Zotero.PaperMachines.filePrompt("mallet_lda_jstor", "multi", [".zip"]);
			if (argArray) {
				var params = Zotero.PaperMachines.promptForProcessParams("mallet_lda");
				if (params) {
					argArray = argArray.concat(["json", JSON.stringify(params)]);
					return argArray;
				} else {
					return false;
				}
			} else {
				return false;
			}
		},
		"mallet_lda": function () {
			var params = Zotero.PaperMachines.promptForProcessParams("mallet_lda");
			if (params) {
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"mallet_lda_categorical": function (thisGroupID) {
			var params = Zotero.PaperMachines.promptForProcessParams("mallet_lda");
			if (params) {
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"mallet_lda_tags": function (thisGroupID) {
			var tags = Zotero.PaperMachines.promptForTags(thisGroupID);
			if (!tags) {
				return false;
			}
			var params = Zotero.PaperMachines.promptForProcessParams("mallet_lda");
			if (params) {
				params["tags"] = tags;
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"mallet_lda_MI": function (thisGroupID) {
			var query = "SELECT collection from processed_collections WHERE collection = ? AND status = 'done' AND processor = ?;";
			var procs = ["mallet_lda_jstor", "mallet_lda_categorical", "mallet_lda"];
			var alreadyProcessed;
			for (var i in procs) {
				alreadyProcessed = Zotero.PaperMachines.DB.valueQueryAsync(query, [thisGroup, procs[i]]) ? procs[i] + thisGroup : false;
				if (alreadyProcessed) break;
			}
			var subcollections = Zotero.PaperMachines.DB.columnQuery("SELECT child FROM collections WHERE parent = ?;", [thisGroup]);
			var classify = Zotero.PaperMachines.DB.valueQueryAsync(query, [thisGroup, "mallet_classify-file"]);

			if (!subcollections && !classify) {
				alert(Zotero.PaperMachines.prompts["mallet_lda_MI_no_classify"]);
				return false;
			}

			if (alreadyProcessed) {
				var mallet_dir = Zotero.PaperMachines._getOrCreateDir(alreadyProcessed, Zotero.PaperMachines.out_dir);
				return [mallet_dir.path];
			} else {
				alert(Zotero.PaperMachines.prompts["mallet_lda_MI"]);
				return false;
			}
		},
		"mallet_dmr": function () {
			var params = Zotero.PaperMachines.promptForProcessParams("mallet_dmr");
			if (params) {
				return ["json", JSON.stringify(params)];
			} else {
				return false;
			}
		},
		"mallet_dmr_jstor": function () {
			var argArray = Zotero.PaperMachines.filePrompt("mallet_lda_jstor", "multi", [".zip"]);
			if (argArray) {
				var params = Zotero.PaperMachines.promptForProcessParams("mallet_dmr");
				if (params) {
					argArray = argArray.concat(["json", JSON.stringify(params)]);
					return argArray;
				} else {
					return false;
				}
			} else {
				return false;
			}
		},
		"wordcloud_multiple": function () {
			return Zotero.PaperMachines.selectFromOptions("wordcloud_multiple", Zotero.PaperMachines.wordcloudFilters);
		},
	},
	communicationObjects: {},
	noTagsString: "",

	SCHEME: "zotero://papermachines",

	channel: {
		INTERFACE_URI: "chrome://papermachines/content/processors/support/nowordcloud.html",
		newChannel: async function (uri) {
			console.log('newChannel',uri)
			var ioService = Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService);

			var Zotero = Components.classes["@zotero.org/Zotero;1"]
				.getService(Components.interfaces.nsISupports)
				.wrappedJSObject;

			try {
				var [path, queryString] = uri.path.substr(1).split('?');
				var pathParts = path.split('/');

				var file = false;
				var _uri = "data:text/html,";
				var progbar_str = '<html><head><meta charset="UTF-8"/><meta http-equiv="refresh" content="2;URL=' +
					"'zotero://papermachines/" + path + "'" + '"/></head>' +
					'<body><progress id="progressBar"/></body></html>';
				_uri += encodeURIComponent(progbar_str);


				if (pathParts[0] == "search") {
					var ids = Zotero.PaperMachines.search(queryString);
					_uri = "data:application/json," + encodeURIComponent(JSON.stringify(ids));
				} else {
					// var file1 = Zotero.PaperMachines.out_dir.clone();
					var support = '';
					if (pathParts.indexOf("support") != -1) {
						// file1.append("support");
						support = 'support';
					}
					// file1.append(pathParts.slice(-1)[0]);
					var file1 = OS.Path.join(Zotero.PaperMachines.out_dir,support,pathParts.slice(-1)[0]);
					console.log('file1',file1)

					if (file1.exists()) {
						file = file1;
					} else {
						var processResult = Zotero.PaperMachines.DB.rowQuery(Zotero.PaperMachines.processQuery, [path]);
						if (processResult) {
							switch (processResult["status"]) {
								case "done":
									if (processResult["processor"] == "extract") {
										var finished_path = processResult["progressfile"].replace("progress.html",".json");
										Zotero.PaperMachines.addExtractedToDB(finished_path);
									}

									file = Zotero.PaperMachines._getLocalFile(processResult["outfile"]);

									var mostRecentExtractionQuery = "SELECT MAX(timeStamp) FROM processed_collections " +
										"WHERE processor='extract' AND collection = ? OR collection in " +
										"(SELECT parent FROM collections WHERE child = ?);";

									var c = processResult["collection"];
									var mostRecentExtraction = Zotero.PaperMachines.DB.valueQueryAsync(mostRecentExtractionQuery, [c, c]);

									if (mostRecentExtraction && processResult["timeStamp"] < mostRecentExtraction) {
										await Zotero.PaperMachines.DB.queryAsync("UPDATE processed_collections SET status = 'failed' WHERE process_path = ?;", [path]);
										file = false;
									}

									if (!file || !file.exists()) {
										file = false;
										await Zotero.PaperMachines.DB.queryAsync("UPDATE processed_collections SET status = 'failed' WHERE process_path = ?;", [path]);
										// Zotero.PaperMachines._runProcessPath(path);
									}
									break;
								case "running":
									_uri = "data:text/html,";
									_uri += encodeURIComponent(Zotero.PaperMachines._generateProgressPage(processResult));
									break;
								case "failed":
									_uri = "data:text/html,";
									_uri += encodeURIComponent(Zotero.PaperMachines._generateErrorPage(processResult));
									Zotero.PaperMachines._runProcessPath(path);
									break;
								default:
									Zotero.PaperMachines.LOG(processResult);
							}
						} else {
							Zotero.PaperMachines._runProcessPath(path);
						}
					}
				}

				if (file) {
					var ph = Components.classes["@mozilla.org/network/protocol;1?name=file"]
								.createInstance(Components.interfaces.nsIFileProtocolHandler);
					return ioService.newChannelFromURI(ph.newFileURI(file));
				} else {
					var ext_uri = ioService.newURI(_uri, null, null);
					var extChannel = ioService.newChannelFromURI(ext_uri);

					return extChannel;
				}

			} catch (e){
				Zotero.PaperMachines.ERROR(e);
			}
		}
	},
	 init: async function() {
		await Zotero.Schema.schemaUpdatePromise;
		var protocol = Components.classes["@mozilla.org/network/protocol;1?name=zotero"]
								 .getService(Components.interfaces.nsIProtocolHandler)
								 .wrappedJSObject;
		protocol._extensions[this.SCHEME] = this.channel;
		console.log('PaperMachines')
		// console.log('Zotero.DataDirectory.dir',Zotero.DataDirectory.dir)
		console.log('Zotero.DataDirectory.dir',Zotero.DataDirectory.dir)
		Zotero.Error('Zotero.DataDirectory.dir'+Zotero.DataDirectory.dir)

		this.pm_dir = this._getOrCreateDir("papermachines", Zotero.DataDirectory.dir);
		
		this.pm_dir = OS.Path.join(Zotero.DataDirectory.dir, 'papermachines')
		await OS.File.makeDir(this.pm_dir, { ignoreExisting: true })

		this.pm_dir = this._getOrCreateDir("papermachines", Zotero.DataDirectory.dir);
		this.csv_dir = this._getOrCreateDir("csv");
		this.extract_dir = this._getOrCreateDir("extract");
		this.extract_csv_dir = this._getOrCreateDir("extractcsv");
		this.out_dir = this._getOrCreateDir("out");
		this.processors_dir = this._getOrCreateDir("processors");
		this.log_dir = this._getOrCreateDir("logs", this.out_dir);
		this.props_dir = this._getOrCreateDir("props", this.log_dir);
		this.args_dir = this._getOrCreateDir("args");

		this.pm_dir = OS.Path.join(Zotero.DataDirectory.dir, 'papermachines')
		await OS.File.makeDir(this.pm_dir, { ignoreExisting: true });
		this.csv_dir = OS.Path.join(this.pm_dir,"csv");
		await OS.File.makeDir(this.csv_dir, { ignoreExisting: true });
		this.extract_csv_dir = OS.Path.join(this.pm_dir,"extractcsv");
		await OS.File.makeDir(this.extract_csv_dir, { ignoreExisting: true });
		this.out_dir = OS.Path.join(this.pm_dir,"out");
		await OS.File.makeDir(this.out_dir, { ignoreExisting: true });
		this.processors_dir = OS.Path.join(this.pm_dir,"processors");
		await OS.File.makeDir(this.processors_dir, { ignoreExisting: true });
		this.log_dir = OS.Path.join(this.pm_dir,"logs", this.out_dir);
		await OS.File.makeDir(this.log_dir, { ignoreExisting: true });
		this.props_dir = OS.Path.join(this.pm_dir,"props", this.log_dir);
		await OS.File.makeDir(this.props_dir, { ignoreExisting: true });
		this.args_dir = OS.Path.join(this.pm_dir,"args");
		await OS.File.makeDir(this.args_dir, { ignoreExisting: true });

		console.log('pre jython');

		// var jython = this.processors_dir.clone();
		// jython.append("jython.jar");

		// this.jython_path = jython.path;
		this.jython_path = OS.Path.join(this.processors_dir,"jython.jar");

		this.java_exe = '/usr/bin/java';
		console.log('this.java_exe',this.java_exe)

		await this.initDB();

		console.log('past jython');

		// Components.utils.import("chrome://papermachines/content/Preferences.js");
		Components.utils.import("chrome://papermachines/content/strptime.js");

		console.log('past strptime');

		this.getStringsFromBundle();

		console.log('past getStringsFromBundle');

		Components.utils.import("resource://gre/modules/AddonManager.jsm");
		AddonManager.getAddonByID("papermachines@papermachines.org",
			function(addon) {
				Zotero.PaperMachines._updateBundledFilesCallback(addon.getResourceURI("").QueryInterface(Components.interfaces.nsIFileURL).file);
			});

			console.log('past AddonManager');

		// Detect stoplist language changed
		Preferences.observe("extensions.papermachines.general.lang", Zotero.PaperMachines.selectStoplist);

		console.log('past Preferences');

		this.java_exe = this.findJavaExecutable();
		console.log('this.java_exe',this.java_exe)

		await this.initDB();
	},
	initDB: async function(){
		if (this.DB !== null) return;
		const dbpath = OS.Path.join(Zotero.DataDirectory.dir, 'papermachines.sqlite');
		// const dbpath = OS.Path.join(Zotero.DataDirectory.dir, 'papermachines.sqlite');
		// const dbpath = 'papermachines';
		console.log('DBConnection');
		// Connect to (and create, if necessary) papermachines.sqlite in the Zotero directory
		try {
			this.DB = new Zotero.DBConnection(dbpath);
		}
		catch(e){
			console.log("Zotero.DBConnection error",e)
		}
		// console.log("this.DB",this.DB)

		// this.DB.integrityCheck();
    	// const exists = await OS.File.exists(dbpath)

		for (var i in this.schema) {
			if (!await this.DB.tableExists(i)) {
				await this.DB.queryAsync(this.schema[i]);
			}
		}

		await this.DB.queryAsync("UPDATE processed_collections SET status = 'failed' WHERE status = 'running';");
		await this.DB.queryAsync("DELETE from files_to_extract;");
	},
	getZoteroPane: function () {
		// var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		// 			.getService(Components.interfaces.nsIWindowMediator);
		// var enumerator = wm.getEnumerator("navigator:browser");
		// while (enumerator.hasMoreElements()) {
		// 	var win = enumerator.getNext();
		// 	if (!win.ZoteroPane) continue;
		// 	return win.ZoteroPane;
		// }
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
		return win.ZoteroPane;
	},
	createUI: function (retries) {
		retries = (retries !== undefined) ? retries : 3;
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();

		try {
			// var tagSelector = ZoteroPane.document.getElementById("zotero-tag-selector");
			var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
			var tagSelector = win.ZoteroPane.tagSelector;
			if (tagSelector && "id" in tagSelector && tagSelector.id("no-tags-box") && tagSelector.id("no-tags-box").firstChild) {
				Zotero.PaperMachines.noTagsString = tagSelector.id("no-tags-box").firstChild.value;
			}
			win.setTimeout(Zotero.PaperMachines.replaceOnCollectionSelected, 2000);
		} catch (e) {
			Zotero.PaperMachines.ERROR("Tag selector not found - will retry");
			Zotero.PaperMachines.ERROR(e);
			if (retries > 0)
				win.setTimeout(function () { Zotero.PaperMachines.createUI(retries - 1);}, 2000);
		}

		// ZoteroPane.addReloadListener(function () {
		// 	var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		// 		.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
		// 	win.setTimeout(Zotero.PaperMachines.createUI, 2000);
		// });
	},
	extractText: async function () {
		console.log('extractText')
		if(this.DB === null) await this.initDB();
		// console.log('this.DB',this.DB)
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		// var itemGroup = ZoteroPane.getItemGroup();
		var itemGroup = ZoteroPane.getCollectionTreeRow();
		// var itemGroup = ZoteroPane.collectionsView.selectedTreeRow
		// var itemGroup = ZoteroPane.collectionsView;
		var id = this.getItemGroupID(itemGroup);
		console.log('extractText id',id)
		
		// var pdftotext = Zotero.DataDirectory.dir;
		// pdftotext.append(Zotero.Fulltext.pdfConverterFileName);
		// Zotero.Fulltext.getPDFConverterExecAndArgs = function () {
		// 	return {
		// 		exec: _pdfConverter,
		// 		args: ['-datadir', _pdfData]
		// 	}
		// };
		// var pdfConverterFileName = Zotero.Fulltext.getPDFConverterExecAndArgs();
		// console.log('Zotero.Fulltext.pdfConverterFileName',pdfConverterFileName)
		// console.log('Zotero.DataDirectory.dir',Zotero.DataDirectory.dir)
		// var pdftotext = OS.Path.join(Zotero.DataDirectory.dir, pdfConverterFileName)
		var pdftotext = OS.Path.join(Zotero.DataDirectory.dir, 'pdftotext')
		// await OS.File.makeDir(this.pm_dir, { ignoreExisting: true });

		var path = "zotero://papermachines/extract/" + Zotero.PaperMachines.getItemGroupID(itemGroup) + "/" + encodeURIComponent(pdftotext);
		// this.DB.beginTransaction();
		this.DB.queryAsync("UPDATE processed_collections SET status = 'failed' WHERE processor='extract' AND collection = ?;", [id]);
		this.DB.queryAsync("DELETE FROM collection_docs WHERE collection = ? OR collection IN (SELECT child FROM collections WHERE parent = ?);", [id, id]);
		// this.DB.commitTransaction();

		var queue = new Zotero.PaperMachines._Sequence(function() {
			// Zotero.UnresponsiveScriptIndicator.enable();
			Zotero.hideZoteroPaneOverlays();
			//Zotero.PaperMachines.openWindowOrTab(path);
			path = "extract/" + Zotero.PaperMachines.getItemGroupID(itemGroup) + "/" + encodeURIComponent(pdftotext);
			Zotero.PaperMachines._runProcessPath(path);
		});

		// Zotero.UnresponsiveScriptIndicator.disable();

		queue.grandTotal = await Zotero.PaperMachines.countItemsInGroup(itemGroup) || 1000;

		console.log('queue.grandTotal',queue.grandTotal)

		Zotero.showZoteroPaneProgressMeter("Searching for files to extract");

		await this.captureCollectionTreeStructure(itemGroup);

		this.processItemGroup(itemGroup, function (group) {
			queue.add(Zotero.PaperMachines.extractFromItemGroup, group, queue);
		});

		queue.next();
	},
	countText: async function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		//var itemGroup = ZoteroPane.getItemGroup();
		var itemGroup = ZoteroPane.getCollectionTreeRow();
		var id = this.getItemGroupID(itemGroup);
		var docs = await this.DB.valueQueryAsync("SELECT COUNT(*) FROM collection_docs WHERE collection = ? OR collection IN (SELECT child FROM collections WHERE parent = ?);", [id, id]);
		var count = Zotero.PaperMachines.countItemsInGroup(itemGroup);

		var label = (docs*100.0/count).toString() + "%; " + docs.toString() + " out of " + count.toString() + " docs in DB";

		alert(label);
	},
	_sanitizeFilename: function (filename) {
		return filename.replace(/_/g,"-").replace(/ /g,"_").replace(/[^-A-Za-z0-9_.]/g,"").substring(0,64);
	},
	/**
	 * Returns an nsIFile object for the requested dir, creating it if necessary
	 * @param {String} dir name of desired directory
	 * @param {nsIFile} [parent] the parent directory, defaults to "papermachines" dir
	*/
	_getOrCreateDir: function(dir, parent) {
		parent = parent || this.pm_dir;
		var _dir = OS.Path.join(parent,dir);
		console.log("_getOrCreateDir",parent,dir)
		OS.File.makeDir(_dir, { ignoreExisting: true });
		return _dir;
		// return this._getOrCreateNode(dir, parent, true);
	},
	_getOrCreateFile: function(file, parent) {
		parent = parent || this.pm_dir;
		console.log('file',file,"parent",parent)
		// return await this._getOrCreateNode(file, parent, false);
		return OS.Path.join(parent,file);
	},
	_getLocalFile: function (path) {
		var file = Components.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsILocalFile);
		try {
			file.initWithPath(path);
		} catch (e) {
			Zotero.PaperMachines.ERROR(path);
			Zotero.PaperMachines.ERROR(e);
		}
		return file;
	},
	_getOrCreateNode: async function (node, parent, dir_or_file) {
		try {
			parent = parent || this.pm_dir;
			newNode = parent.clone();
			newNode.append(node);

			if (!newNode.exists()) {
				if (dir_or_file) {
					// newNode.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
					await OS.File.makeDir(newNode, { ignoreExisting: true });
				} else {
					// newNode.create(Components.interfaces.nsIFile.FILE_TYPE, 0644);
					await OS.File.stat(newNode);
				}
			}
		} catch (e) {
			Zotero.PaperMachines.ERROR(node + " could not be created.");
			Zotero.PaperMachines.ERROR(e);
			newNode = null;
		}
		return newNode;
	},
	runProcess: async function () {
		console.log('runProcess')
		var func_args = Array.prototype.slice.call(arguments);
		var processPathParts = [func_args[0]];

		var thisGroupID = Zotero.PaperMachines.getThisGroupID();

		var count = await Zotero.PaperMachines.countExtractedItems(thisGroupID);
		console.log('count',count)
		if (!count) {
			alert(Zotero.PaperMachines.prompts["empty"]);
			return false;
		}
		processPathParts.push(thisGroupID);

		var additional_args = func_args.slice(1);

		if (processPathParts[0] in Zotero.PaperMachines.processesThatPrompt) {
			var prompt_result = Zotero.PaperMachines.processesThatPrompt[processPathParts[0]](thisGroupID);
			if (prompt_result) additional_args.push.apply(additional_args, prompt_result);
			else return;
		}
		console.log('processPathParts done')

		additional_args = additional_args.map(function (d) { return encodeURIComponent(d);});

		processPathParts = processPathParts.concat(additional_args);
		console.log('openWindowOrTab')
		Zotero.PaperMachines.openWindowOrTab("zotero://papermachines/"+processPathParts.join('/'), processPathParts[0]);
	},
	_checkIfRunning: async function (processPath) {
		var sql = "SELECT id FROM processed_collections WHERE process_path = ? AND status = 'running';";
		return await Zotero.PaperMachines.DB.queryAsync(sql, [processPath]);
	},
	_runProcessPath: async function (processPath) {
		console.log('_runProcessPath')
		var processPathParts = processPath.split('/'),
			processor = processPathParts[0],
			thisID = processPathParts[1],
			additional_args = processPathParts.slice(2).map(function (d) { return decodeURIComponent(d);});

		var processName = processor + thisID;
		var thisGroup = Zotero.PaperMachines.getGroupByID(thisID);
		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);

		console.log('processor',processor)
		console.log('thisID',thisID)
		console.log('additional_args',additional_args)

		var checkIfRunning = await Zotero.PaperMachines._checkIfRunning(processPath);
		console.log('checkIfRunning',checkIfRunning)

		if (checkIfRunning.length !==0 ) {
			return;
		}
		
		// var processor_file = Zotero.PaperMachines.processors_dir.clone();
		// processor_file.append(processor + ".py");
		var processor_file = OS.Path.join(Zotero.PaperMachines.processors_dir,processor + ".py");
		console.log('processor_file',processor_file)

		var proc = Components.classes["@mozilla.org/process/util;1"]
			.createInstance(Components.interfaces.nsIProcess);

		if (processor == "extract") {
			var csv = await Zotero.PaperMachines.buildExtractCSV(thisID);
		} else {
			var csv = await Zotero.PaperMachines.buildCSV(thisGroup);
		}

		console.log("build CSV done")

		var progressFile = Zotero.PaperMachines._getOrCreateFile(processor + thisID + "progress.html", Zotero.PaperMachines.out_dir);
		var outFile = Zotero.PaperMachines.out_dir;//.clone();

		var args = [Zotero.PaperMachines.processors_dir, csv, Zotero.PaperMachines.out_dir, collectionName];
		args = args.concat(additional_args);

		var args_str = JSON.stringify(args);
		var args_hash = Zotero.PaperMachines.argsHash(args_str);
		var argsHashFilename = args_hash + ".json";
		var argFile = Zotero.PaperMachines._getOrCreateFile(argsHashFilename, Zotero.PaperMachines.args_dir);
		Zotero.File.putContentsAsync(argFile, args_str);

		var loggingProperties = Zotero.PaperMachines.createLogPropertiesFile(args_hash, progressFile.replace(".html", ".txt"));

		var procArgs = [processor_file, argFile];

		outFile = OS.Path.join(outFile,(processor + thisID + "-" + args_hash + ".html"));
		console.log('outFile',outFile)

		var sql = "INSERT OR REPLACE INTO processed_collections (process_path, collection, processor, status, progressfile, outfile) " +
			" values (?, ?, ?, ?, ?, ?);";
		await Zotero.PaperMachines.DB.queryAsync(sql, [processPath, thisID, processor, "running", progressFile, outFile]);

		console.log('sql done')

		var callback = function (finished) {
			if (finished) {
				var sql_update = "UPDATE processed_collections SET status = 'done' WHERE process_path = ?;";
				Zotero.PaperMachines.DB.queryAsync(sql_update, [this.processPath]);
			} else {
				var sql_update = "UPDATE processed_collections SET status = 'failed' WHERE process_path = ?;";
				Zotero.PaperMachines.DB.queryAsync(sql_update, [this.processPath]);
			}
		};

		console.log('callback')

		var observer = new Zotero.PaperMachines.processObserver(processor, processPath, callback);

		console.log('observer')

		// var java_exe_file = Zotero.PaperMachines._getLocalFile(Zotero.PaperMachines.java_exe);
		var java_exe_file = Zotero.PaperMachines.java_exe;

		console.log('java_exe_file',java_exe_file)

		if (processor.indexOf("mallet") != -1) {
			procArgs = ["-Djava.util.logging.config.file="+loggingProperties].concat(procArgs);
		}
		var mem_alloc = Preferences.get("extensions.papermachines.general.increasemem") ?
			"-Xmx4g" : "-Xmx1g";
		procArgs = [mem_alloc, "-Dfile.encoding=UTF8","-jar", this.jython_path].concat(procArgs);

		Zotero.PaperMachines.LOG(java_exe_file + " " + procArgs.map(function(d) { return d.indexOf(" ") != -1 ? '"' + d + '"' : d; }).join(" "));

		console.log('java_exe_file',java_exe_file)
		console.log('procArgs',procArgs)

		proc.init(java_exe_file);
		proc.runAsync(procArgs, procArgs.length, observer);
	},
	replaceTagsBoxWithWordCloud: function (uri) {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		var iframe = document.createElementNS(XUL_NS, "iframe");
		iframe.setAttribute("src", uri);
		iframe.setAttribute("id", "no-tags-box");
		iframe.setAttribute("height", 160);
		iframe.setAttribute("flex", 2);
		var tagSelector = ZoteroPane.document.getElementById("zotero-tag-selector");
		// var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		// 	.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
		// var tagSelector = win.ZoteroPane.tagSelector;
		var tagSelectorGroup = ZoteroPane.document.getAnonymousNodes(tagSelector);//[0];

		if(tagSelectorGroup === null) return;

		var currentBox = tagSelector.id("no-tags-box");
		tagSelectorGroup.replaceChild(iframe, currentBox);

		iframe.collapsed = false;

		tagSelector.id("tags-toggle").collapsed = true;
	},
	restoreTagsBox: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		var tagSelector = ZoteroPane.document.getElementById("zotero-tag-selector");
		// var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		// 	.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
		// var tagSelector = win.ZoteroPane.tagSelector;
		var tagSelectorGroup = ZoteroPane.document.getAnonymousNodes(tagSelector)[0];

		if(tagSelectorGroup === null) return;

		const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
		var noTagsBox = document.createElementNS(XUL_NS, "vbox");
		noTagsBox.setAttribute("id", "no-tags-box");
		noTagsBox.setAttribute("align", "center");
		noTagsBox.setAttribute("pack", "center");
		noTagsBox.setAttribute("flex", "1");
		var label = document.createElementNS(XUL_NS, "label");
		label.setAttribute("value", Zotero.PaperMachines.noTagsString);
		noTagsBox.appendChild(label);

		var currentBox = tagSelector.id("no-tags-box");
		if (currentBox.tagName == "iframe") {
			tagSelectorGroup.replaceChild(noTagsBox, currentBox);
			noTagsBox.collapsed = !tagSelector._empty;
		}
	},
	onCollectionSelected: function () {
		var thisID = Zotero.PaperMachines.getThisGroupID();
		try {
			Zotero.PaperMachines.activateMenuItems(thisID);
		} catch (e) { Zotero.PaperMachines.ERROR(e); }

		if (Zotero.PaperMachines.tagCloudReplace) {
			if (!Zotero.PaperMachines.hasBeenExtracted(thisID)) {
				Zotero.PaperMachines.restoreTagsBox();
			} else {
				Zotero.PaperMachines.displayWordCloud();
			}
		}
	},
	replaceOnCollectionSelected: function () {
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		var ZoteroPane = win.ZoteroPane;
		if (ZoteroPane && ZoteroPane.loaded && ZoteroPane.collectionsView && ZoteroPane.collectionsView.selection && !ZoteroPane.onCollectionSelected_) {
			if (Zotero.PaperMachines.tagCloudReplace) {
				win.ZoteroPane.tagSelector.uninit();
				//ZoteroPane.document.getElementById("zotero-tag-selector").uninit();
			}

			ZoteroPane.onCollectionSelected_ = ZoteroPane.onCollectionSelected;
			ZoteroPane.onCollectionSelected = function () {
				ZoteroPane.onCollectionSelected_();
				try {
					Zotero.PaperMachines.onCollectionSelected();
				} catch (e) {
					Zotero.PaperMachines.ERROR(e);
				}
			};
			win.setTimeout(Zotero.PaperMachines.onCollectionSelected, 500);
		} else {
			win.setTimeout(Zotero.PaperMachines.replaceOnCollectionSelected, 2000);
		}
	},
	displayWordCloud: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		// var thisID = Zotero.PaperMachines.getItemGroupID(ZoteroPane.getItemGroup());
		var thisID = Zotero.PaperMachines.getItemGroupID(ZoteroPane.getCollectionTreeRow());

		var wordCloudURI = "zotero://papermachines/wordcloud/" + thisID;
		Zotero.PaperMachines.replaceTagsBoxWithWordCloud(wordCloudURI);
	},
	buildExtractCSV: async function (thisID) {
		console.log('buildExtractCSV')
		var query = "SELECT filename, itemID, outfile, collection FROM files_to_extract;";
		var docs = await this.DB.queryAsync(query);

		// var csv_file = this.extract_csv_dir.clone();
		// csv_file.append(thisID + ".csv");
		var csv_file = OS.Path.join(this.extract_csv_dir,thisID + ".csv");
		console.log('csv_file',csv_file)

		var csv_str = "";
		var header = ["filename", "itemID", "outfile", "collection"];
		csv_str += header.join(",") + "\n";
		for (var i in docs) {
			var row = [];
			for (var k in header) {
				var val;
				console.log('header[k]',header[k])
				console.log('docs[i]',docs[i])
				if (header[k] in docs[i]) {
					val = docs[i][header[k]];
				}

				if (typeof val == "string") {
					val = val.replace(/"/g, ""); //remove quotes
					if (val.indexOf(',') != -1) {
						val = '"' + val + '"';
					}
				}

				row.push(val);
			}
			csv_str += row.join(",") + "\n";
		}
		Zotero.File.putContentsAsync(csv_file, csv_str);
		return csv_file;
	},
	addExtractedToDB: async function(path) {
		console.log('addExtractedToDB')
		var extracted = Zotero.PaperMachines._getLocalFile(path);
		var json_data = Zotero.File.getContents(extracted);
		var docs = JSON.parse(json_data);
		for (var i in docs) {
			var doc = docs[i];
			await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO doc_files (itemID, filename) VALUES (?,?)", [doc.itemID, doc.filename]);
			await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO collection_docs (collection,itemID) VALUES (?,?)", [doc.collection, doc.itemID]);
			await Zotero.PaperMachines.DB.queryAsync("DELETE FROM files_to_extract WHERE itemID = ?;", [doc.itemID]);
		}
	},
	buildDocArray: function(collection) {
		var docs = [];
		this.processItemGroup(collection, function (itemGroup) {
			var thisGroup = Zotero.PaperMachines.getItemGroupID(itemGroup);
			var groupName = itemGroup.getName();

			if ("getItems" in itemGroup) {
				var items = itemGroup.getItems();
			} else if ("getChildItems" in itemGroup) {
				var items = itemGroup.getChildItems();
			}

			for (var i in items) {
				var item = items[i];
				if (item.isRegularItem()) {
					var filename = Zotero.PaperMachines.findItemInDB(item);
					if (filename) {
						docs.push({"itemID": item.id, "filename": filename, "label": groupName});
					}
				} else if (item.isTopLevelItem()) {
					var filename = Zotero.PaperMachines.findItemInDB(item);
					if (filename) {
						docs.push({"itemID": item.id, "filename": filename, "label": groupName});
					}
				}
			}
		});
		// var query = "SELECT itemID, filename FROM doc_files WHERE itemID IN " +
		// 			"(SELECT itemID FROM collection_docs WHERE collection = ? OR collection IN " +
		// 			"(SELECT child FROM collections WHERE parent = ?));";

		// var docs = this.DB.queryAsync(query, [id, id]);
		return docs;
	},
	buildCSV: function(collection) {
		var id = this.getItemGroupID(collection);
		if (!id) return false;

		// var csv_file = this.csv_dir.clone();
		// csv_file.append(id + ".csv");
		var csv_file = OS.Path.join(this.csv_dir,id + ".csv");
		// if (!csv_file.exists()) {
		// 	csv_file.create(Components.interfaces.nsIFile.FILE_TYPE, 0644);
		// }
		console.log('csv_file',csv_file)

		var csv_str = "";
		var header = ["filename", "itemID", "title", "label", "key", "libraryKey", "year", "date", "place"];
		csv_str += header.join(",") + "\n";

		var docs = this.buildDocArray(collection);
		if (docs.length == 0) return false;

		for (var i in docs) {
			var row = [];
			var item = Zotero.Items.get(docs[i]["itemID"]);
			for (var k in header) {
				var val;
				if (header[k] in docs[i]) {
					val = docs[i][header[k]];
				} else if (header[k] == "year") {
					val = this.getYearOfItem(item);
				} else if (header[k] == "date") {
					val = item.getField("date", true, true);
				} else if (header[k] == "place") {
					val = item.getField("place");
				} else if (header[k] == "key") {
					val = item.key;
				} else if (header[k] == "libraryKey") {
					val = item.libraryKey;
				} else if (header[k] == "label") {
					val = this.getCollectionOfItem(item);
				} else {
					try {
						val = item.getField(header[k]);
					} catch (e) { val = "";}
				}

				if (typeof val == "string") {
					val = val.replace(/"/g, ""); //remove quotes
					if (val.indexOf(',') != -1) {
						val = '"' + val + '"';
					}
				}
				row.push(val);
			}
			csv_str += row.join(",") + "\n";
		}
		Zotero.File.putContentsAsync(csv_file, csv_str);
		return csv_file;
	},
	captureCollectionTreeStructure: async function (collection) {
		this.processItemGroup(collection, async function (itemGroup) {
			if ("isCollection" in itemGroup && itemGroup.isCollection()) {
				var thisCollection = itemGroup.hasOwnProperty("ref") ? itemGroup.ref : itemGroup;
				var childID = Zotero.PaperMachines.getItemGroupID(itemGroup);

				if (thisCollection.parentID) {
					while (thisCollection.parentID != null) {
						var parentID = (thisCollection.libraryID != null ? thisCollection.libraryID.toString() : "") + "C" + thisCollection.parentID;
						await Zotero.PaperMachines.DB.queryAsync("INSERT OR REPLACE INTO collections (parent,child) VALUES (?,?)", [parentID, childID]);
						thisCollection = Zotero.Collections.get(thisCollection.parentID);
					}
				}

				await Zotero.PaperMachines.DB.queryAsync("INSERT OR REPLACE INTO collections (parent,child) VALUES (?,?)", [thisCollection.libraryID != null ? thisCollection.libraryID.toString() : "L", childID]);
			}
		});
	},
	traverse: function () {
		// var itemGroup = ZoteroPane.getItemGroup();
		var itemGroup = ZoteroPane.getCollectionTreeRow();
		var collections = Zotero.PaperMachines.captureCollectionTreeStructure(itemGroup);
		var names = "";

		this.processItemGroup(itemGroup, function (group) { names += group.getName() + ", "; });
		alert(names);
	},
	_iterateOverItemGroups: function (itemGroups, callback) {
		for (var i in itemGroups) {
			if (Array.prototype.isPrototypeOf(itemGroups[i])) {
				Zotero.PaperMachines._iterateOverItemGroups(itemGroups[i], callback);
			} else {
				callback(itemGroups[i]);
			}
		}
	},
	processItemGroup: function (itemGroup, callback) {
		var itemGroups = this.traverseItemGroup(itemGroup);
		this._iterateOverItemGroups(itemGroups, callback);
	},
	traverseItemGroup: function (itemGroup) {
		var itemGroups = [];
		if (typeof itemGroup.isLibrary == "function" && itemGroup.isLibrary()) {
			if (itemGroup.id == "L") {
				itemGroups.push(ZoteroPane.collectionsView._dataItems[0][0]);
				var collectionKeys = Zotero.DB.columnQuery("SELECT key from collections WHERE libraryID IS NULL;");
				if (collectionKeys) {
					// place collections first; that way, documents will be marked with the collection they're in, not the overall library
					itemGroups = collectionKeys.map(function(d) { return Zotero.Collections.getByLibraryAndKey(null, d); }).concat(itemGroups);
				}
			}
		} else {
			if (typeof itemGroup.isCollection == "function" && itemGroup.isCollection()) {
				itemGroups.push(itemGroup);
				var currentCollection = ("ref" in itemGroup) ? itemGroup.ref : itemGroup;
				if (currentCollection.hasChildCollections()) {
					var children = currentCollection.getChildCollections();
					for (var i in children) {
						itemGroups.push(Zotero.PaperMachines.traverseItemGroup(children[i]));
					}
				}
			} else if (typeof itemGroup.isGroup == "function" && itemGroup.isGroup()) {
				if (itemGroup.ref.hasCollections()) {
					var children = itemGroup.ref.getCollections();
					for (var i in children) {
						itemGroups.push(Zotero.PaperMachines.traverseItemGroup(children[i]));
					}
				}
			}
		}
		return itemGroups;
	},
	showTextInTopicView: function () {
		var items = ZoteroPane.getSelectedItems();
		var objs = Object.keys(Zotero.PaperMachines.communicationObjects);
		if (objs.length == 0) {
			var listenerID = "/mallet/" + Zotero.PaperMachines.getThisGroupID();
			Zotero.PaperMachines.openWindowOrTab("zotero://papermachines"+listenerID, listenerID);
		}
		// Zotero.PaperMachines.sendMessageTo(listenerID, "receive-select", {"itemID": items[0].id});
		// alert(Zotero.PaperMachines.getFilenameForItem(items[0]));
	},
	locateTextInMapView: function () {
		var items = ZoteroPane.getSelectedItems();
		var location = this.getPlaceOfItem(items[0]);
		alert(location);
	},
	getPlaceOfItem: async function (item) {
		var path = await this.DB.valueQueryAsync("SELECT filename FROM doc_files WHERE itemID = ?;",[item.id]);
		var place = false;	

		if (path) {
			var geoparseFile = Zotero.PaperMachines._getLocalFile(path.replace(".txt", "_geoparse.json"));
			if (geoparseFile.exists()) {
				var geoparse = JSON.parse(Zotero.File.getContents(geoparseFile));
				if (geoparse["city"]) {
					place = geoparse["city"];
				}
			}
		}
		return place;
	},
	getYearOfItem: function (item) {
		return item.getField("date", true, true).substring(0,4);
	},
	getCollectionOfItem: async function (item) {
		return await this.DB.valueQueryAsync("SELECT collection FROM collection_docs WHERE itemID = ? LIMIT 1;", [item.id]);
	},
	findItemInDB: async function (item) {
		var filename = await this.DB.valueQueryAsync("SELECT filename FROM doc_files WHERE itemID = ?;",[item.id]);
		var existent = false;
		if (filename) {
			var text = Zotero.PaperMachines._getLocalFile(filename);
			existent = text.exists();
			if (!existent) {
				this.DB.queryAsync("DELETE FROM doc_files WHERE filename = ?;", [filename]);
			}
		}
		return existent ? filename : false;
	},
	countItemsInGroup: async function (itemGroup) {
		var count = 0;
		var query = "SELECT COUNT(DISTINCT itemID) FROM collectionItems WHERE collectionID = ?";
		// var query = "SELECT COUNT(DISTINCT itemID) FROM collectionItems WHERE collectionID = ?" +
		// 	" AND itemID in (SELECT sourceItemID FROM itemAttachments WHERE " +
		// 	"mimeType = 'application/pdf' OR mimeType = 'text/html');";
		// this.processItemGroup(itemGroup, function (itemGroup) {
			console.log('itemGroup.isCollection()',itemGroup.isCollection())
			if ("isCollection" in itemGroup && itemGroup.isCollection()) {
				var id = (itemGroup.hasOwnProperty("ref") ? itemGroup.ref.id : itemGroup.id);
				var result = await Zotero.DB.valueQueryAsync(query, [id]);
				console.log('result',result)
				count += result			
			}
		// });
		console.log('count',count)
		return count;
	},
	countExtractedItems: async function (itemGroupID) {
		var sql = "SELECT COUNT(itemID) FROM collection_docs WHERE collection = ? OR collection IN " +
			"(SELECT child FROM collections WHERE parent = ?);";
		return await this.DB.valueQueryAsync(sql, [itemGroupID, itemGroupID]);
	},
	getExtractedItemIDs: function (itemGroupID) {
		var sql = "SELECT itemID FROM collection_docs WHERE collection = ? OR collection IN " +
			"(SELECT child FROM collections WHERE parent = ?);";
		return this.DB.columnQuery(sql, [itemGroupID, itemGroupID]);
	},
	hasBeenExtracted: function (itemGroupID) {
		var sql = "SELECT itemID FROM collection_docs WHERE collection = ? OR collection IN " +
					"(SELECT child FROM collections WHERE parent = ?);";
		if(this.DB === null) this.initDB(); 
		return this.DB.queryAsync(sql, [itemGroupID, itemGroupID]);
	},
	hasBeenProcessed: function (itemGroupID, processor) {
		var sql = "SELECT id FROM processed_collections WHERE collection = ? AND processor = ? AND status = 'done';";

		return this.DB.queryAsync(sql, [itemGroupID, processor]);
	},
	getItemGroupID: function (itemGroup) {
		if (itemGroup === null || itemGroup === undefined) return null;
		if (typeof itemGroup.isCollection === "function" && itemGroup.isCollection()) {
			if (itemGroup.hasOwnProperty("ref")) {
				return (itemGroup.ref.libraryID != null ? itemGroup.ref.libraryID.toString() : "") + "C" + itemGroup.ref.id.toString();
			} else {
				return (itemGroup.libraryID != null ? itemGroup.libraryID.toString() : "") + "C" + itemGroup.id.toString();
			}
		} else if (typeof itemGroup.isGroup === "function" && itemGroup.isGroup()) {
			return itemGroup.ref.libraryID;
		} else {
			return itemGroup.id;
		}
	},
	getGroupByID: function (id) {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		if (typeof(id.indexOf) == "function" && id.indexOf("C") != -1) {
			return Zotero.Collections.get(id.split("C")[1]);
		} else if (id == "L") {
			return ZoteroPane.collectionsView._dataItems[0][0];
		} else {
			try {
				return ZoteroPane.collectionsView._dataItems.filter(function (d) { return d[0].ref.libraryID == id;})[0][0];
			} catch (e) {  return false; }
		}
	},
	getGroupName: function(thisGroup) {
		if (thisGroup) {
			return thisGroup.name || (typeof thisGroup.getName === "function" ? thisGroup.getName() : "");
		} else {
			return "";
		}
	},
	getNameOfGroup: function (id) {
		try {
			return Zotero.PaperMachines.getGroupByID(id).getName();
		}
		catch (e) { return false; }
	},
	extractFromItemGroup: async function (itemGroup, queue) {
		var thisGroup = Zotero.PaperMachines.getItemGroupID(itemGroup);
		var dir = Zotero.PaperMachines._getOrCreateDir(thisGroup);
		// Zotero.showZoteroPaneProgressMeter(itemGroup.getName());

		

		var items = null;
		if ("getItems" in itemGroup) {
			items = await itemGroup.getItems();
			console.log('getItems')

		} else if ("getChildItems" in itemGroup) {
			items = await itemGroup.getChildItems();
			console.log('getChildItems')
		}
		// console.log('ITEMS',items)

		for (var i in items) {
			var item = items[i], fulltext = "", filename = "";
			// console.log("item is",item)
			// if(item){
			if (item.isRegularItem()) {
				if (Preferences.get("extensions.papermachines.general.download_snapshots")) {
					Zotero.PaperMachines._downloadSnapshots(item);
				}
				queue.add(Zotero.PaperMachines.processItem, itemGroup.getName(), item, dir, i, queue);
			} else if (item.isTopLevelItem() && Preferences.get("extensions.papermachines.general.extract_standalone")) {
				if (item.isAttachment()) {
					queue.add(Zotero.PaperMachines._extractStandalone, item, dir, i, queue);
				} else if (item.isNote() && Preferences.get("extensions.papermachines.general.extract_notes")) {
					queue.add(Zotero.PaperMachines._extractStandaloneNote, item, dir, i, queue);
				}
			}
			// }
		}

		queue.next();
	},
	bulkChangeField: function (items, field, new_value, force) {
		for (var i in items) {
			var item = items[i];
			if (force || item.getField(field) == '') {
				item.setField(field, new_value);
				item.save();
			}
		}
	},
	changeField: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		var items = ZoteroPane.getSelectedItems();
		var params = Zotero.PaperMachines.promptForProcessParams("change_field");
		if (params) {
			Zotero.PaperMachines.bulkChangeField(items, params["field"], params["value"], params["force"]);
		} else {
			return false;
		}
	},
	getFilenameForItem: function (item) {
		var filename = "";
		if (item.isRegularItem()) {
			var year = this.getYearOfItem(item);
			year = (year != "" ? year+" - " : "");

			filename = (item.firstCreator != "" ? item.firstCreator + " - " : "");
			filename += year;
			filename += item.getDisplayTitle();
		} else if (item.isAttachment() && item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
			filename = item.getFilename().replace(/\..{3,3}$/,''); // strip extension
		}
		return Zotero.PaperMachines._sanitizeFilename(filename) + ".txt";
	},
	processItem: async function(itemGroupName, item, dir, i, queue) {
		var percentDone = (parseInt(i)+queue.runningTotal)*100.0/queue.grandTotal;
		Zotero.updateZoteroPaneProgressMeter(percentDone);
		var gettingNotes = Preferences.get("extensions.papermachines.general.extract_notes");
		var gettingTags = Preferences.get("extensions.papermachines.general.extract_tags");
		var gettingPDF = Preferences.get("extensions.papermachines.general.extract_pdf");
		var gettingHTML = Preferences.get("extensions.papermachines.general.extract_html");
		var gettingWord = Preferences.get("extensions.papermachines.general.extract_word");
		var gettingTXT = Preferences.get("extensions.papermachines.general.extract_txt");

		console.log('gettingPDF',gettingPDF)

		// var outFile = dir.clone();
		// outFile.append(Zotero.PaperMachines.getFilenameForItem(item));
		var outFile = OS.Path.join(dir,Zotero.PaperMachines.getFilenameForItem(item));
		console.log('outFile',outFile)

		var notes_str = "<html><head></head><body>";

		var attachments = item.getAttachments(false);
		for (var a in attachments) {
			var a_item = Zotero.Items.get(attachments[a]);
			var mimetype = a_item.attachmentMIMEType;
			console.log('mimetype',mimetype)
			if ((mimetype == 'application/pdf' && gettingPDF)
			   || (mimetype == 'text/html' && gettingHTML)
			   || ((mimetype == 'application/msword' || mimetype == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') && gettingWord)
			   || (mimetype == 'text/plain' && gettingTXT)) {
				var orig_file = a_item.getFile().path;
				if (orig_file) {
					console.log('[orig_file, item.id, outFile, OS.Path.basename(dir)]',orig_file, item.id, outFile, OS.Path.basename(dir))
					await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO files_to_extract (filename, itemID, outfile, collection) VALUES (?,?,?,?)", [orig_file, item.id, outFile, OS.Path.basename(dir)]);
				}
			}

			if (gettingNotes && "hasNote" in a_item && a_item.hasNote()) {
				notes_str += a_item.getNote() + "\n---\n";
			}
		}

		if (gettingNotes) {
			Zotero.PaperMachines._extractNotes(item, dir, notes_str);
		}

		if (gettingTags) {
			Zotero.PaperMachines._extractTags(item, dir);
		}

		queue.runningTotal += 1;
		queue.next();
	},
	_extractNotes: async function (item, dir, notes_str) {
		// var notesFile = dir.clone();
		// notesFile.append(Zotero.PaperMachines.getFilenameForItem(item).replace(".txt", "_notes.html"));
		var notesFile = OS.Path.join(dir,Zotero.PaperMachines.getFilenameForItem(item).replace(".txt", "_notes.html"));
		console.log('notesFile',notesFile)

		notes_str = notes_str || "<html><head></head><body>";

		var notes = item.getNotes(false);
		for (var b in notes) {
			var note = Zotero.Items.get(notes[b]);
			notes_str += note.getNote() + "\n---\n";
		}

		notes_str += "</body></html>";

		Zotero.File.putContentsAsync(notesFile, notes_str);
		console.log('[notesFile, item.id, notesFile.replace("_notes.html", ".txt"), dir]',notesFile, item.id, notesFile.replace("_notes.html", ".txt"), OS.Path.basename(dir))
		await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO files_to_extract (filename, itemID, outfile, collection) VALUES (?,?,?,?)", [notesFile, item.id, notesFile.replace("_notes.html", ".txt"), OS.Path.basename(dir)]);
	},
	_extractStandalone: async function (item, dir, i, queue) {
		var percentDone = (parseInt(i)+queue.runningTotal)*100.0/queue.grandTotal;
		Zotero.updateZoteroPaneProgressMeter(percentDone);

		// var outFile = dir.clone();
		// outFile.append(Zotero.PaperMachines.getFilenameForItem(item));
		var outFile = OS.Path.join(dir,Zotero.PaperMachines.getFilenameForItem(item));
		console.log('outFile',outFile)
		console.log('[item.getFile().path, item.id, outFile, OS.Path.basename(dir)]',item.getFile().path, item.id, outFile, OS.Path.basename(dir))
		await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO files_to_extract (filename, itemID, outfile, collection) VALUES (?,?,?,?)", [item.getFile().path, item.id, outFile, OS.Path.basename(dir)]);

		queue.runningTotal += 1;
		queue.next();
	},
	_extractStandaloneNote: async function (item, dir, i, queue) {
		var percentDone = (parseInt(i)+queue.runningTotal)*100.0/queue.grandTotal;
		Zotero.updateZoteroPaneProgressMeter(percentDone);

		// var notesFile = dir.clone();
		// notesFile.append(Zotero.PaperMachines._sanitizeFilename(item.getNoteTitle()) + ".html");
		var notesFile = OS.Path.join(dir,Zotero.PaperMachines._sanitizeFilename(item.getNoteTitle()) + ".html");
		console.log('notesFile',notesFile)

		var notes_str = "<html><head></head><body>";
		notes_str += item.getNote();
		notes_str += "</body></html>";

		Zotero.File.putContentsAsync(notesFile, notes_str);
		console.log('[notesFile, item.id, notesFile.replace(".html", ".txt"), OS.Path.basename(dir)]',notesFile, item.id, notesFile.replace(".html", ".txt"), OS.Path.basename(dir))
		await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO files_to_extract (filename, itemID, outfile, collection) VALUES (?,?,?,?)", [notesFile, item.id, notesFile.replace(".html", ".txt"), OS.Path.basename(dir)]);

		queue.runningTotal += 1;
		queue.next();
	},
	_extractTags: async function (item, dir, tags_str) {
		// var tagsFile = dir.clone();
		// tagsFile.append(Zotero.PaperMachines.getFilenameForItem(item).replace(".txt", "_tags.txt"));
		var tagsFile = OS.Path.join(dir,Zotero.PaperMachines.getFilenameForItem(item).replace(".txt", "_tags.txt"));
		console.log('tagsFile',tagsFile)

		tags_str = tags_str || "";

		var tags = item.getTags(false);
		var tags_str = tags.map(function (d) { return d.name}).join(", ");

		Zotero.File.putContentsAsync(tagsFile, tags_str);
		console.log('[tagsFile, item.id, tagsFile.replace("_tags.txt", ".txt"), OS.Path.basename(dir)]',tagsFile, item.id, tagsFile.replace("_tags.txt", ".txt"), OS.Path.basename(dir))
		await Zotero.PaperMachines.DB.queryAsync("INSERT OR IGNORE INTO files_to_extract (filename, itemID, outfile, collection) VALUES (?,?,?,?)", [tagsFile, item.id, tagsFile.replace("_tags.txt", ".txt"), OS.Path.basename(dir)]);
	},
	_downloadSnapshots: function (item) {
		var current_attachments = Zotero.Items.get(item.getAttachments(false));
		if (current_attachments.length == 0) {
			var url = item.getField("url");
			if (url) {
				Zotero.Attachments.importFromURL(url, item.id);
			}
		}
		var modes = current_attachments.map(function (a) { return a.attachmentLinkMode;});
		if (modes.indexOf(Zotero.Attachments.LINK_MODE_LINKED_URL) != -1) {
			if (modes.indexOf(0) == -1 && modes.indexOf(1) == -1 && modes.indexOf(2) == -1) {
				for (var i in current_attachments) {
					if (current_attachments[i].attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
						var url = current_attachments[i].getField("url");
						Zotero.Attachments.importFromURL(url, item.id);
					}
				}
			}
		}
		item.save();
	},
	_updateBundledFilesCallback: function (installLocation) {
		Zotero.PaperMachines.install_dir = installLocation;
		var xpiZipReader, isUnpacked = installLocation.isDirectory();
		if(!isUnpacked) {
			xpiZipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"]
					.createInstance(Components.interfaces.nsIZipReader);
			xpiZipReader.open(installLocation);

			var entries = xpiZipReader.findEntries("processors");
			while (entries.hasMore()) {
				var entry = entries.getNext();
				this.LOG(entry);
			}
		} else {
			var procs_dir = installLocation.clone();
			procs_dir.append("chrome");
			procs_dir.append("content");
			procs_dir.append("papermachines");
			procs_dir.append("processors");

			this._copyAllFiles(procs_dir, Zotero.PaperMachines.processors_dir);
		}

		var stoplist_lang = Preferences.get("extensions.papermachines.general.lang") || "en";
		this.selectStoplist(stoplist_lang);

		// copy the supporting javascript, css, etc. to the output dir
		Zotero.PaperMachines.aux_dir = Zotero.PaperMachines._getOrCreateDir("support", Zotero.PaperMachines.processors_dir);

		var new_aux = Zotero.PaperMachines._getOrCreateDir("support", Zotero.PaperMachines.out_dir);
		Zotero.PaperMachines._copyAllFiles(Zotero.PaperMachines.aux_dir, new_aux);
	},
	_copyOrMoveAllFiles: async function (copy_or_move, source, target, recursive) {
		// var files = source.directoryEntries;
		// while (files.hasMoreElements()) {
		// 	var f = files.getNext().QueryInterface(Components.interfaces.nsIFile);
		// 	if (f.isFile()) {
		// 		var destFile = target.clone();
		// 		destFile.append(f.leafName);
		// 		if (destFile.exists() && f.lastModifiedTime > destFile.lastModifiedTime) { // overwrite old versions
		// 			destFile.remove(false);
		// 		}
		// 		if (copy_or_move) {
		// 			f.copyTo(target, f.leafName);
		// 		} else {
		// 			f.moveTo(target, f.leafName);
		// 		}
		// 	} else if (f.isDirectory() && recursive !== false) {
		// 		var newtarget = this._getOrCreateDir(f.leafName, target);
		// 		this._copyOrMoveAllFiles(copy_or_move, f, newtarget, recursive);
		// 	}
		// }
		// this.args_dir = OS.Path.join(this.pm_dir,"args");
				if (copy_or_move) {
			await OS.File.copy(source, target);
				} else {
			await OS.File.move(source, target);
		}
	},
	_copyAllFiles: function (source, target, recursive) {
		this._copyOrMoveAllFiles(true, source, target, recursive);
	},
	_moveAllFiles: function (source, target, recursive) {
		this._copyOrMoveAllFiles(false, source, target, recursive);
	},
	_getProcessParams: function (processPath) {
		return Zotero.PaperMachines.DB.rowQuery(Zotero.PaperMachines.processQuery, [processPath]);
	},
	_generateProgressPage: function (processResult) {
		var thisGroup = Zotero.PaperMachines.getGroupByID(processResult["collection"]);

		var iterations = false;

		try {
			var progTextFile = Zotero.PaperMachines._getLocalFile(processResult["progressfile"].replace(".html",".txt"));
			var prog_str = Zotero.File.getContents(progTextFile);
			var iterString = prog_str.match(/(?:<)\d+/g);
			if (iterString) {
				iterations = parseInt(iterString.slice(-1)[0].substring(1));
			}
		} catch (e) { Zotero.PaperMachines.ERROR(e); }


		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);
		var progbar_str = '<html><head><meta charset="UTF-8"/><meta http-equiv="refresh" content="5;URL=' +
			"'zotero://papermachines/" + processResult["process_path"] + "'" + '"/></head><body>';
			try {
				progbar_str += '<div>' + Zotero.PaperMachines.processNames[processResult["processor"]] + ': ' + collectionName + '</div>';
			} catch (e) {
				progbar_str += '<div>' + collectionName + '</div>';
			}
			if (typeof iterations === "number") {
				progbar_str += '<progress id="progressBar" max="1000" value="';
				progbar_str += iterations.toString();
				progbar_str += '"/>';
			} else {
				progbar_str += '<progress id="progressBar"/>';
			}
			progbar_str += '</body></html>';
		return progbar_str;
	},
	_generateErrorPage: function (processResult) {
		var thisGroup = Zotero.PaperMachines.getGroupByID(processResult["collection"]);

		var log_str = false;

		try {
			var logTextFile = Zotero.PaperMachines._getLocalFile(processResult["outfile"].replace(".html",".log"));
			var log_str = Zotero.File.getContents(logTextFile);
		} catch (e) { Zotero.PaperMachines.ERROR(e); }

		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);
		var logpage_str = '<html><head><meta charset="UTF-8"/><meta http-equiv="refresh" content="20;URL=' +
			"'zotero://papermachines/" + processResult["process_path"] + "'" + '"/></head><body>';
			try {
				logpage_str += '<div>' + Zotero.PaperMachines.processNames[processResult["processor"]] + ': ' + collectionName + '</div>';
			} catch (e) {
				logpage_str += '<div>' + collectionName + '</div>';
			}
			logpage_str += "<div>" + Zotero.PaperMachines.processNames["failed"] + "</div>";
			if (log_str) {
				logpage_str += "<pre>" + log_str + "</pre>";
			} else {
				logpage_str += "<div>" + Zotero.PaperMachines.processNames["nolog"] + "</div>";
			}
			logpage_str += '</body></html>';
		return logpage_str;
	},
	getThisGroupID: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		//return Zotero.PaperMachines.getItemGroupID(ZoteroPane.getItemGroup());
		return Zotero.PaperMachines.getItemGroupID(ZoteroPane.getCollectionTreeRow());
	},
	activateMenuItems: function (thisID) {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		var active = this.hasBeenExtracted(thisID);
		var ids = Zotero.PaperMachines.processors.concat(["reset-output"]);
		ids.forEach(function (d) {
			ZoteroPane.document.getElementById(d).disabled = !active;
		});

		var experimentalOn = Preferences.get("extensions.papermachines.general.experimental");

		for (var i in Zotero.PaperMachines.experimentalFeatures) {
			var feature = Zotero.PaperMachines.experimentalFeatures[i];
			var elem = ZoteroPane.document.getElementById(feature);
			if (elem) {
				elem.disabled = !experimentalOn;
			}
		}
		// var highlightFunctions = ["mallet", "geodict"];
		// highlightFunctions.forEach(function (d) {
		// 	var elem = ZoteroPane.document.getElementById(d+"-highlight");
		// 	if (elem) {
		// 		elem.disabled = !Zotero.PaperMachines.hasBeenProcessed(thisID, d);
		// 	}
		// });
	},
	getProcessesForCollection: function (thisID) {
		var query = "SELECT processor, process_path, outfile, timeStamp FROM processed_collections " +
			"WHERE status = 'done' AND processor != 'extract' AND collection = ?;";
		var processes = this.DB.queryAsync(query, [thisID]);
		var options = [];
		for (var i in processes) {
			var processResult = processes[i],
				process = processResult["processor"],
				outfile = processResult["outfile"],
				process_path = processResult["process_path"],
				timestamp = processResult["timeStamp"],
				path_parts = process_path.split("/"),
				label = ": " + path_parts.slice(2).map(function(d) { return decodeURIComponent(d); }).join(", "),
				shortened_label = label.length > 50 ? label.substring(0,50) + "..." : label;
			options.push({"name": this.processNames[process] + (path_parts.length > 2 ? shortened_label : ""), "label": timestamp, "value": outfile, "url": "zotero://papermachines/" + process_path});
		}
		return options;
	},
	viewOutput: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		// var thisGroup = ZoteroPane.getItemGroup();
		var thisGroup = ZoteroPane.getCollectionTreeRow()
		// var collectionTreeRow = this.collectionsView.selectedTreeRow;
		var thisID = Zotero.PaperMachines.getItemGroupID(thisGroup);
		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);

		var options = Zotero.PaperMachines.getProcessesForCollection(thisID);
		for (var i in options) {
			options[i].value = options[i].url;
		}

		var url = Zotero.PaperMachines.selectFromOptions("view_process", options);
		if (url) {
			Zotero.PaperMachines.openWindowOrTab(url);
		}
	},
	exportOutput: function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		//var thisGroup = ZoteroPane.getItemGroup();
		var thisGroup = ZoteroPane.getCollectionTreeRow();
		var thisID = Zotero.PaperMachines.getItemGroupID(thisGroup);
		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);

		var export_dir = this.filePrompt("export_dir", "getfolder");
		if (export_dir) {
			var options = Zotero.PaperMachines.getProcessesForCollection(thisID);
			var export_processes = Zotero.PaperMachines.selectFromOptions("export_processes", options, "multiplecheck");
			if (export_processes && export_processes.length > 0) {
				var new_dir = this._getOrCreateDir(collectionName + " visualizations", export_dir);
				var new_aux = this._getOrCreateDir("support", new_dir);
				this._copyAllFiles(this.aux_dir, new_aux);
				for (var i in export_processes) {
					var file = Zotero.PaperMachines._getLocalFile(export_processes[i]);
					file.copyTo(new_dir, OS.Path.basename(file));
					var file2 = Zotero.PaperMachines._getLocalFile(export_processes[i].replace('.html', '.js'));
					if (file2.exists()) file2.copyTo(new_dir, OS.Path.basename(file2));
				}
			}
		}
	},
	exportText: function() {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		// var thisGroup = ZoteroPane.getItemGroup();
		var thisGroup = ZoteroPane.getCollectionTreeRow();
		var thisID = Zotero.PaperMachines.getItemGroupID(thisGroup);
		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);

		var export_dir = this.filePrompt("export_dir", "getfolder");

        if (export_dir) {
            var new_dir = this._getOrCreateDir(collectionName + " texts", export_dir);
            // var source_dir = this.pm_dir.clone();
            // source_dir.append(thisID);
			var source_dir = OS.Path.join(dir,thisID);
			console.log('source_dir',source_dir)

            if ("getItems" in thisGroup) {
				var items = thisGroup.getItems();
			} else if ("getChildItems" in thisGroup) {
				var items = thisGroup.getChildItems();
			}

            for (var i in items) {
				var item = items[i];
				if (item.isRegularItem()) {
					var filename = Zotero.PaperMachines.findItemInDB(item);

					if (filename) {
                        var f = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                        f.initWithPath(filename);

                        if (! f.isDirectory()) {
                            f.copyTo(new_dir, f.leafName);
                        }
					}
				}
			}
			var csv_file = Zotero.PaperMachines.buildCSV(thisGroup);
			csv_file.copyTo(new_dir, "_metadata.csv");
        }
	},
	resetOutput: async function () {
		var ZoteroPane = Zotero.PaperMachines.getZoteroPane();
		// var thisGroup = ZoteroPane.getItemGroup();
		var thisGroup = ZoteroPane.getCollectionTreeRow();
		var thisID = Zotero.PaperMachines.getItemGroupID(thisGroup);
		var collectionName = Zotero.PaperMachines.getGroupName(thisGroup);

		var options = Zotero.PaperMachines.getProcessesForCollection(thisID);
		var reset_processes = Zotero.PaperMachines.selectFromOptions("reset_processes", options, "multiplecheck");
		if (reset_processes && reset_processes.length > 0) {
			for (var i in reset_processes) {
				var file = Zotero.PaperMachines._getLocalFile(reset_processes[i]);
				if (file.exists()) file.remove(false);
				var file2 = Zotero.PaperMachines._getLocalFile(reset_processes[i].replace('.html', '.js'));
				if (file2.exists()) file2.remove(false);

				await Zotero.PaperMachines.DB.queryAsync("DELETE FROM processed_collections WHERE collection=? AND outfile=?;", [thisID, reset_processes[i]]);
			}
		}
	},
	search: function (str) {
		var s = new Zotero.Search();
		s.addCondition("quicksearch-everything", "contains", str);
		return s.search();
	},
	filePrompt: function(prompt, mode, filters) {
		const nsIFilePicker = Components.interfaces.nsIFilePicker;

		var fp_mode;
		switch (mode) {
			case "save":
				fp_mode = nsIFilePicker.modeSave;
				break;
			case "getfolder":
				fp_mode = nsIFilePicker.modeGetFolder;
				break;
			case "multi":
				fp_mode = nsIFilePicker.modeOpenMultiple;
				break;
			case "open":
			default:
				fp_mode = nsIFilePicker.modeOpen;
		}
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			.createInstance(nsIFilePicker);
		fp.init(window, Zotero.PaperMachines.prompts[prompt], fp_mode);
		if (filters) {
			for (var i in filters) {
				fp.appendFilter(i, filters[i]);
			}
		} else {
			fp.appendFilters(nsIFilePicker.filterAll)
		}
		var rv = fp.show();
		if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
			switch (mode) {
				case "multi":
					var files = fp.files;
					var paths = [];
					while (files.hasMoreElements())
					{
						var arg = files.getNext().QueryInterface(Components.interfaces.nsILocalFile).path;
						paths.push(arg);
					}
					return paths;
					break;
				case "getfolder":
					return fp.file;
				case "open":
				case "save":
				default:
					return [fp.file.path];
			}
		}
	},
	argsHash: function (args_str) {
		return Zotero.PaperMachines.hashCode(args_str);
	},
	hashCode: function (str) {
		var r = 0;
		for (var i = 0; i < str.length; i++) {
			r = (r << 5) - r + str.charCodeAt(i);
			r &= r;
		}
		if (r < 0) {
			r = r + 0xFFFFFFFF + 1;
		}
		return r.toString(16);
	},
	selectFromOptions: function(prompt, options, multiple) {
		var type = "select";
		if (multiple) type = multiple;
		var params = {"dataIn": {"type": type, "prompt": Zotero.PaperMachines.prompts[prompt], "options": options}, "dataOut": null};

		return Zotero.PaperMachines._promptUser(params);
	},
	selectStoplist: function (lang) {
		// var stopwords_dir = Zotero.PaperMachines.processors_dir.clone();
		// stopwords_dir.append("stopwords");
		var stopwords_dir = OS.Path.join(Zotero.PaperMachines.processors_dir,"stopwords");
		var orig_stopfile = Zotero.PaperMachines._getOrCreateFile("stopwords_" + lang + ".txt", stopwords_dir);
		console.log('orig_stopfile',orig_stopfile)
		var stopwords = '';
		try{
			stopwords = Zotero.File.getContents(orig_stopfile) + '\n';
		} catch(e){
			console.log(e);
		}
		var stopfile = Zotero.PaperMachines._getOrCreateFile("stopwords.txt", Zotero.PaperMachines.processors_dir);
		console.log('stopfile',stopfile)
		var custom_stopwords = Preferences.get("extensions.papermachines.stopwords");

		if (custom_stopwords) {
			stopwords += custom_stopwords;
		}

		Zotero.File.putContentsAsync(stopfile, stopwords);
	},
	textPrompt: function(prompt, default_text) {
		if (!default_text) var default_text = "";
		var params = {"dataIn": {"type": "text", "default": default_text, "prompt": Zotero.PaperMachines.prompts[prompt]}, "dataOut": null};
		return Zotero.PaperMachines._promptUser(params);
	},
	yesNoPrompt: function(prompt) {
		var params = {"dataIn": {"type": "yes-no", "prompt": Zotero.PaperMachines.prompts[prompt]}, "dataOut": null};
		return Zotero.PaperMachines._promptUser(params);
	},
	_promptUser: function(params) {
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		win.openDialog("chrome://papermachines/content/dialog.xul", "", "chrome, dialog, modal", params);

		if (params.dataOut != null) {
			return params.dataOut;
		} else {
			return false;
		}
	},
	customPhrasenet: function () {
		var custom_str = Zotero.PaperMachines.textPrompt("phrasenet_custom", "x (?:leads to|causes|triggers) y");
		if (custom_str) {
			Zotero.PaperMachines.runProcess('phrasenet', custom_str);
		}
	},
	processParamLists: {
		"mallet_lda": [{"name": "topics", "type": "text", "pref": "extensions.papermachines.lda.topics"},
			{"name": "iterations", "type": "text", "pref": "extensions.papermachines.lda.iterations", "advanced": true},
			{"name": "stemming", "type": "check", "pref": "extensions.papermachines.lda.stemming"},
			// {"name": "segmentation", "type": "check", "pref": "extensions.papermachines.lda.segmentation", "advanced": true},
			{"name": "tfidf", "type": "check", "pref": "extensions.papermachines.lda.tfidf"},
			{"name": "min_df", "type": "text", "pref": "extensions.papermachines.lda.min_df", "advanced": true},
			{"name": "alpha", "type": "text", "pref": "extensions.papermachines.lda.alpha", "advanced": true},
			{"name": "beta", "type": "text", "pref": "extensions.papermachines.lda.beta", "advanced": true},
			{"name": "burn_in", "type": "text", "pref": "extensions.papermachines.lda.burn_in", "advanced": true},
			{"name": "optimize_interval", "type": "text", "pref": "extensions.papermachines.lda.optimize_interval", "advanced": true},
			{"name": "symmetric_alpha", "type": "check", "pref": "extensions.papermachines.lda.symmetric_alpha", "advanced": true},
			{"name": "lang", "type": "text", "pref": "extensions.papermachines.general.lang", "advanced": true},
			{"name": "year_range", "type": "text", "value": "", "advanced": true},
		],
		"mallet_dmr": [{"name": "topics", "type": "text", "pref": "extensions.papermachines.lda.topics"},
			{"name": "stemming", "type": "check", "pref": "extensions.papermachines.lda.stemming"},
			{"name": "tfidf", "type": "check", "pref": "extensions.papermachines.lda.tfidf"},
			{"name": "min_df", "type": "text", "pref": "extensions.papermachines.lda.min_df", "advanced": true},
			{"name": "features", "type": "text", "value": "decade", "advanced": true},
			{"name": "lang", "type": "text", "pref": "extensions.papermachines.general.lang", "advanced": true}
		],
		"bulk_import": [{"name": "title", "type": "text", "pref": "extensions.papermachines.import.title"},
			{"name": "pubtitle", "type": "text", "pref": "extensions.papermachines.import.pubtitle"},
			{"name": "guessdate", "type": "check", "pref": "extensions.papermachines.import.guessdate"},
			{"name": "dateformat", "type": "text", "pref": "extensions.papermachines.import.dateformat"},
			{"name": "guessissue", "type": "check", "pref": "extensions.papermachines.import.guessissue"},
			{"name": "issueregex", "type": "text", "pref": "extensions.papermachines.import.issueregex"},
			{"name": "startingoffset", "type": "text", "pref": "extensions.papermachines.import.startingoffset"},
		],
		"ngrams":  [{"name": "n", "type": "text", "value": "1"},
			{"name": "top_ngrams", "type": "text", "value": "100"},
			{"name": "min_df", "type": "text", "value": "3"},
			{"name": "interval", "type": "text", "value": "1", "advanced": true},
			{"name": "start_date", "type": "text", "value": "", "advanced": true},
			{"name": "end_date", "type": "text", "value": "", "advanced": true},
		],
		"wordcloud_translate":  [{"name": "lang_from", "type": "text", "value": "Hebrew"},
			{"name": "lang_to", "type": "text", "value": "English"},
			{"name": "tfidf", "type": "check", "value": true}
		],
		"wordcloud_chronological": [
			{"name": "interval", "type": "text", "value": "90"},
			{"name": "start_date", "type": "text", "value": ""},
			{"name": "end_date", "type": "text", "value": ""},
		],
		"change_field":  [{"name": "field", "type": "text", "value": ""},
			{"name": "value", "type": "text", "value": ""},
			{"name": "force", "type": "check", "value": false}
		]
	},
	promptForProcessParams: function(process) {
		var items = Zotero.PaperMachines.processParamLists[process];
		var advanced = false;
		for (var i in items) {
			items[i].label = Zotero.PaperMachines.paramLabels[process][items[i].name];
			if ("pref" in items[i]) {
				items[i].value = Preferences.get(items[i].pref);
			}
			if ("advanced" in items[i]) {
				advanced = true;
			}
		}
		var intro = Zotero.PaperMachines.processNames[process];
		return Zotero.PaperMachines._promptForProcessParams(intro, items, advanced);
	},
	_promptForProcessParams: function(intro, items, advanced) {
		var params = {"dataIn": {"intro": intro, "items": items}, "dataOut": null};
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		if (advanced) {
			win.openDialog("chrome://papermachines/content/process_params_advanced.xul", "", "chrome, dialog, modal, width=400, height=500", params);
		} else {
			win.openDialog("chrome://papermachines/content/process_params.xul", "", "chrome, dialog, modal, width=400, height=500", params);
		}

		if (params.dataOut != null) {
			return params.dataOut;
		} else {
			return false;
		}
	},
	promptForTags: function (thisGroupID) {
		var items = [];
		var itemIDs = Zotero.PaperMachines.getExtractedItemIDs(thisGroupID);
		var sql = "SELECT tags.name, tags.tagID, COUNT(itemTags.itemID) as 'itemsCounted' FROM tags INNER JOIN itemTags WHERE tags.tagID = itemTags.tagID AND ";
		var sql_items = "itemID in (";
		for (var i = 0, n = itemIDs.length - 1; i < n; i++) {
			sql_items += "?,";
		}
		sql_items += "?)";

		sql += sql_items + " GROUP BY itemTags.tagID;";

		var tags = Zotero.DB.queryAsync(sql, itemIDs);

		for (var i in tags) {
			var tag = tags[i];
			if (tag.itemsCounted > 1) {
				items.push({"name": tag.name, "tagID": tag.tagID, "weight": tag.itemsCounted});
			}
		}

		items.sort(function(a,b) { return b.weight - a.weight; });

		var params = {"dataIn": {"intro": Zotero.PaperMachines.processNames["select_tags"], "items": items}, "dataOut": null};
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		win.openDialog("chrome://papermachines/content/tags.xul", "", "chrome, dialog, modal, width=400, height=500", params);

		if (params.dataOut != null) {
			var tags = {};
			for (var tag in params.dataOut) {
				var sql = "SELECT itemID FROM itemTags WHERE tagID = ? AND ";
				tags[params.dataOut[tag]] = Zotero.DB.columnQuery(sql + sql_items + ";", [tag].concat(itemIDs));
			}
			return tags;
		} else {
			return false;
		}
	},
	RISfields: {
		"title": "TI",
		"pubtitle": "T2",
		"date": "DA",
		"language": "LA",
		"year": "PY"
	},
	generateRIS: function (items) {
		var ris = "";
		for (var i in items) {
			var item = items[i];

			var myRis = "TY  - " + item.type + "\n";	// type must come first
			for (var field in Zotero.PaperMachines.RISfields) {
				if (field in item) {
					myRis += Zotero.PaperMachines.RISfields[field] + "  - " + item[field] + "\n";
				}
			}
			if ("files" in item) {
				for (var j in item.files) {
					var f = item.files[j];
					myRis += "L1  - " + f + "\n";
				}
			}
			myRis += "ER  - \n\n";
			ris += myRis;
		}
		return ris;
	},
	bulkImport: function () {
		var import_dir = this.filePrompt("import_dir", "getfolder");
		if (import_dir) {
			var params = Zotero.PaperMachines.promptForProcessParams("bulk_import");
			if (params) {
				var items = [];
				var found_obj = {};
				var n = params["startingoffset"] || 1;

				Zotero.PaperMachines.findPDFsInDir(import_dir, found_obj);

				// build up associative array of dates/items, either using PDF metadata or dir names
				var dated_items = {};

				if (params["guessdate"]) {
					for (var dir_name in found_obj) {
						found_obj[dir_name].forEach(function (f) {
							var date = Zotero.PaperMachines.getDateFromPDFMetadata(f);
							if (date) {
								var ris_date = date.toISOString().replace(/-/g,"/").substring(0,10) + "/"; // 2012/09/12/
								if (!(ris_date in dated_items)) {
									dated_items[ris_date] = {"type": "NEWS", "pubtitle": params["pubtitle"], "date": ris_date, "files": []};
									if (params["guessissue"]) {
										var issue = Zotero.PaperMachines.applyRegexToPDF(f, "(" + params["issueregex"] + ")");
										if (issue) {
											dated_items[ris_date]["title"] = issue[0];
										}
									} else {
										dated_items[ris_date]["title"] = params["title"] + " " + n.toString();
										n++;
									}
								}
								dated_items[ris_date]["files"].push("file://" + f.path);
							} else {
								var item = {"type": "NEWS", "title": params["title"] + " " + n.toString(), "pubtitle": params["pubtitle"], "files": ["file://" + f.path]};
								if (params["guessissue"]) {
									var issue = Zotero.PaperMachines.applyRegexToPDF(f, "(" + params["issueregex"] + ")");
									if (issue) {
										item["title"] = issue[0];
									}
								}
								items.push(item);
								n++;
							}
						});
					}
					for (var ris_date in dated_items) {
						items.push(dated_items[ris_date]);
					}
				} else {
					for (var dir_name in found_obj) {
						var date = false;
						try {
							date = strptime(dir_name, params["dateformat"]);
						} catch (e) {
							Zotero.PaperMachines.LOG("Date not understood: " + dir_name);
							Zotero.PaperMachines.LOG(e.name + ": " + e.message);
						}

						var files = found_obj[dir_name].map(function (f) { return "file://" + f.path;});
						var item = {"type": "NEWS", "title": params["title"] + " " + n.toString(), "pubtitle": params["pubtitle"], "files": files};
						if (date) {
							item.date = date.toISOString().replace(/-/g,"/").substring(0,10) + "/"; // 2012/09/12/
						}
						if (params["guessissue"]) {
							var issue = Zotero.PaperMachines.applyRegexToPDF(found_obj[dir_name][0], "(" + params["issueregex"] + ")");
							if (issue) {
								item["title"] = issue[0];
							}
						}
						items.push(item);
						n++;
					}
				}

				var ris_str = Zotero.PaperMachines.generateRIS(items);
				var ris_file = Zotero.PaperMachines._getOrCreateFile(OS.Path.basename(import_dir) + ".ris", import_dir);
				Zotero.File.putContentsAsync(ris_file, ris_str);

				Zotero_File_Interface.importFile(ris_file);
			}
		}
	},
	findPDFsInDir: function (dir, found_obj) {
		var files = dir.directoryEntries;
		while (files.hasMoreElements()) {
			var f = files.getNext().QueryInterface(Components.interfaces.nsIFile);
			if (f.isFile() && f.leafName.toLowerCase().indexOf(".pdf") != -1) {
				if (!(OS.Path.basename(dir) in found_obj)) {
					found_obj[OS.Path.basename(dir)] = [];
				}
				found_obj[OS.Path.basename(dir)].push(f);
			} else if (f.isDirectory()) {
				Zotero.PaperMachines.findPDFsInDir(f, found_obj);
			}
		}
	},
	applyRegexToPDF: function (file, regex, regex2) {
		// var pdftotext = Zotero.DataDirectory.dir;
		// pdftotext.append(Zotero.Fulltext.pdfConverterFileName);
		var pdftotext = OS.Path.join(Zotero.DataDirectory.dir, 'pdftotext')

		var textFile = file.parent;
		textFile.append(OS.Path.basename(file) + ".txt");
		Zotero.debug('Running pdftotext -enc UTF-8 -nopgbrk "' + file.path + '" "' + textFile.path + '"');

		var proc = Components.classes["@mozilla.org/process/util;1"].
				createInstance(Components.interfaces.nsIProcess);
		proc.init(pdftotext);

		var args = ['-enc', 'UTF-8', '-nopgbrk', file.path, textFile.path];
		try {
			proc.runw(true, args, args.length);
		} catch (e) {
			Zotero.PaperMachines.LOG("Error running pdftotext");
			Zotero.PaperMachines.LOG(e.name + ": " + e.message);
		}

		var contents = Zotero.File.getContents(textFile);
		textFile.remove(false);
		if (regex2) {
			return [contents.match(regex), contents.match(regex2)];
		} else {
			return contents.match(regex);
		}
	},
	getDateFromPDFText: function (file) {
		var pdf_years = Zotero.PaperMachines.applyRegexToPDF(file, "[0-9]{4,4}");
		return pdf_years[0];
	},
	getDateFromPDFMetadata: function (file) {
		// var pdfinfo = Zotero.DataDirectory.dir;
		// pdfinfo.append(Zotero.Fulltext.pdfInfoFileName);
		var pdfinfo = OS.Path.join(Zotero.DataDirectory.dir, 'pdfinfo')

		var infoFile = file.parent;
		infoFile.append(OS.Path.basename(file) + ".info");
		Zotero.debug('Running pdfinfo "' + file.path + '" "' + infoFile.path + '"');

		var proc = Components.classes["@mozilla.org/process/util;1"].
				createInstance(Components.interfaces.nsIProcess);
		proc.init(pdfinfo);

		var args = [file.path, infoFile.path];
		try {
			proc.runw(true, args, args.length);
		} catch (e) {
			Zotero.PaperMachines.LOG("Error running pdfinfo");
			Zotero.PaperMachines.LOG(e.name + ": " + e.message);
		}
		var contents = Zotero.File.getContents(infoFile);
		infoFile.remove(false);

		if (contents) {
			try {
				// Parse pdfinfo output
				var date_str = contents.replace(/ +/g, ' ').match("CreationDate: (.+)")[0];
				var date = strptime(date_str, "%A %B %d %H:%M:%S %Y")
				return date;
			} catch (e) {
				Zotero.PaperMachines.LOG("Date could not be parsed");
				Zotero.PaperMachines.LOG(e.name + ": " + e.message);
				return false;
			}
		} else {
			return false;
		}
	},
	LOG: function(msg) {
	  var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
									 .getService(Components.interfaces.nsIConsoleService);
	  consoleService.logStringMessage(msg);
	  Zotero.debug(msg);
	},
	ERROR: function (e) {
		Components.utils.reportError(e);
		if (e && e.hasOwnProperty("stack")) {
			Zotero.PaperMachines.LOG(e.stack);
		} else {
			Zotero.debug(e);
		}
	},
	getStringsFromBundle: function () {
		var stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
		Zotero.PaperMachines.bundle = stringBundleService.createBundle("chrome://papermachines/locale/papermachines.properties");
		var enumerator = Zotero.PaperMachines.bundle.getSimpleEnumeration();
		Zotero.PaperMachines.bundleStrings = {};
		while (enumerator.hasMoreElements()) {
			var property = enumerator.getNext().QueryInterface(Components.interfaces.nsIPropertyElement);
			Zotero.PaperMachines.bundleStrings[property.key] = property.value;
			var nameParts = property.key.split(".");
			if (nameParts.length == 2 && Zotero.PaperMachines.hasOwnProperty(nameParts[0])) {
				if (!Zotero.PaperMachines[nameParts[0]]) {
					Zotero.PaperMachines[nameParts[0]] = {};
				}
				Zotero.PaperMachines[nameParts[0]][nameParts[1]] = property.value;
			}
			if (nameParts.length == 3 && Zotero.PaperMachines.hasOwnProperty(nameParts[0])) {
				if (!Zotero.PaperMachines[nameParts[0]]) {
					Zotero.PaperMachines[nameParts[0]] = {};
				}
				if (!Zotero.PaperMachines[nameParts[0]].hasOwnProperty(nameParts[1])) {
					Zotero.PaperMachines[nameParts[0]][nameParts[1]] = {};
				}
				Zotero.PaperMachines[nameParts[0]][nameParts[1]][nameParts[2]] = property.value;
			}
		}
	},
	openWindowOrTab: function(url) {
		if (Zotero.isStandalone) {
			window.open(url);
		} else {
			var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
			win.gBrowser.selectedTab = win.gBrowser.addTab(url);
		}
	},
	openPreferences: function() {
	  if (!this._preferencesWindow || this._preferencesWindow.closed) {
	    var instantApply = Preferences.get("browser.preferences.instantApply");
	    var features = "chrome,titlebar,toolbar,centerscreen" +
	      (instantApply ? ",dialog=no" : ",modal");

	    this._preferencesWindow =
	      window.openDialog("chrome://papermachines/content/options.xul", "papermachines-prefs-window", features);
	  }

	  this._preferencesWindow.focus();
	},
	createLogPropertiesFile: function(hash, progress_file_path) {
		var logging_properties_file = this._getOrCreateFile("log_" + hash + ".properties", this.props_dir);
		var logging_properties_file_path = logging_properties_file.path;

		var log_str = "handlers=java.util.logging.FileHandler\n" +
			".level=INFO\n" +
			"java.util.logging.FileHandler.formatter=java.util.logging.SimpleFormatter\n" +
			"java.util.logging.FileHandler.pattern=" + progress_file_path;
		Zotero.File.putContentsAsync(logging_properties_file, log_str);
		return logging_properties_file_path;
	},
	findJavaExecutable: function () {
		var java_exe = Preferences.get("extensions.papermachines.general.java_exe");
		if (!java_exe || java_exe == "") {
			var environment = Components.classes["@mozilla.org/process/environment;1"]
	                            .getService(Components.interfaces.nsIEnvironment);
			var path = environment.get("PATH"),
				java_name = "java",
				directories = []

			if (Zotero.isWin) {
				java_name += "w.exe";

				directories = path.split(";");
			} else {
				// directories = path.split(":");
				directories = directories.concat(["/usr/bin", "/usr/local/bin", "/sw/bin", "/opt/local/bin"]);
			}

			for (var i = 0, n = directories.length; i < n; i++) {
				var executable = Zotero.PaperMachines._getLocalFile(directories[i]);
				executable.append(java_name);
				if (executable.exists()) {
					java_exe = executable.path;
					break;
				}
			}

			if (java_exe) {
				Preferences.set("extensions.papermachines.general.java_exe", java_exe);
			} else {
				var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);

				prompts.alert(null, "No Java executable found", Zotero.PaperMachines.prompts["no_java"]);
				Zotero.PaperMachines.ERROR(Zotero.PaperMachines.prompts["no_java"]);
			}
		}
		return java_exe;

	},
	evtListener: function (evt) {
		var node = evt.target, doc = node.ownerDocument;

		var refresh = node.getAttribute("refresh");
		if (refresh) {
			Zotero.PaperMachines.init();
			return;
		}

		var query = node.getAttribute("query");
		if (query) {
			node.setUserData("response", JSON.stringify(Zotero.PaperMachines.search(query)), null);
			var listener = doc.createEvent("HTMLEvents");
			listener.initEvent("papermachines-response", true, false);
			node.dispatchEvent(listener);
		}
	}
};

Zotero.PaperMachines.processObserver = function (processName, processPath, callback) {
  this.processName = processName;
  this.processPath = processPath;
  this.callback = callback;
  this.register();
};

Zotero.PaperMachines.processObserver.prototype = {
  observe: function(subject, topic, data) {
	switch (topic) {
		case "process-failed":
			Zotero.PaperMachines.LOG("Process " + this.processName + " failed.");
			this.callback(false);
			break;
		case "process-finished":
			var exitValue = subject.QueryInterface(Components.interfaces.nsIProcess).exitValue;
			if (typeof exitValue == "number") {
				if (exitValue == 0) { //success
					Zotero.PaperMachines.LOG("Process " + this.processName + " finished successfully.");
					this.callback(true);
				} else {
					Zotero.PaperMachines.ERROR("Process " + this.processName + " failed with exit value " + exitValue);
					this.callback(false);
				}
			}
			break;
	}
	this.unregister();
  },
  register: function() {
	var observerService = Components.classes["@mozilla.org/observer-service;1"]
						  .getService(Components.interfaces.nsIObserverService);
	observerService.addObserver(this, "process-failed", false);
	observerService.addObserver(this, "process-finished", false);
  },
  unregister: function() {
	var observerService = Components.classes["@mozilla.org/observer-service;1"]
							.getService(Components.interfaces.nsIObserverService);
	observerService.removeObserver(this, "process-failed");
	observerService.removeObserver(this, "process-finished");
  }
};

Zotero.PaperMachines._Sequence = function (onDone) {
	this.list = [];
	this.onDone = onDone;
	this.closeTimer = null;
	this.runningTotal = 1;
	this.grandTotal = 1;
};

Zotero.PaperMachines._Sequence.prototype = {
	startCloseTimer: function () {
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		this.closeTimer = win.setTimeout(this.onDone, 5000);
	},
	belayCloseTimer: function () {
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");
		win.clearTimeout(this.closeTimer);
	},
	add: function() {
		var args = Array.prototype.slice.call(arguments);
		this.list.push(args);
	},
	next: function(before) {

		var my = this;
		if (typeof before == "function") before();
		var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser");

		win.setTimeout(function () {
			if (my.list.length > 0) {
				my.belayCloseTimer();
				var current = my.list.shift();
				(current.shift()).apply(this, current);
			} else {
				my.startCloseTimer();
			}
		}, 20);
	}
};

// window.addEventListener('load', function(e) { Zotero.PaperMachines.createUI(); }, false);
window.addEventListener("papermachines-request", function (e) { Zotero.PaperMachines.evtListener(e); }, false, true);


// Initialize the utility
window.addEventListener('load', function(e) { 

	
	return new Promise((resolve, reject) => { 

	return Zotero.PaperMachines.init(); 

	})

}, false);

// Zotero.PaperMachines = Zotero.PaperMachines || new PaperMachines
