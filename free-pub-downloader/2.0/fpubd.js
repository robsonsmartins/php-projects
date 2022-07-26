/*----------------------------------------------------------------------------*/
/**
 * @fileOverview Free Publication Downloader
 * 
 * @author Robson Martins (https://robsonmartins.com)
 * @version 2.2
 */
/*----------------------------------------------------------------------------*/
/* 
 *  Copyright (C) 2022 Robson S. Martins
 *  Robson Martins <http://www.robsonmartins.com>
 * 
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * ---------------------------------------------------------------------------- 
 *  Requirements: 
 *
 *   jsPDF (https://github.com/MrRio/jsPDF)
 *   jsZip (https://github.com/Stuk/jszip)
 *   StreamSaver (https://github.com/jimmywarting/StreamSaver.js/)
 *	 web-streams-polyfill (https://github.com/MattiasBuelens/
 *                         web-streams-polyfill)
 *   Backend (REST API)
 */
/*----------------------------------------------------------------------------*/

var FreePubDownloader = function(endpoint){
	PDF_CREATOR_APPNAME  = 'Free Publication Downloader';
	PDF_CREATOR_URL      = 'https://robsonmartins.com/content/info/fpubd/';
	OUTPUT_DOCUMENT_TYPE = 'pdf';
	OUTPUT_ZIP_TYPE      = 'zip';
	DEFAULT_INITIAL_PAGE =     0;
	DEFAULT_PAGE_SIZE    =    10;
	GET_IMG_MAX_RETRY    =     3;
	IMG_QUALITY          =  0.92;
	_abort    = false;
	_endpoint = endpoint;
};

FreePubDownloader.prototype.services = function(onSuccess,onError){
	var $this = this;
	$this._services(onSuccess,onError);
};
	
FreePubDownloader.prototype.search = function(url,term,page,size,
											  onSuccess,onError){
	var $this = this;
	$this._search(url,term,page,size,onSuccess,onError);
};

FreePubDownloader.prototype.list = function(url,term,page,size,
											onSuccess,onError){
	var $this = this;
	$this._list(url,term,page,size,onSuccess,onError);
};

FreePubDownloader.prototype.download = function(url,term,isSearch,
							whiteList,blackList,onSuccess,onError,onProgress){
	var $this = this;
	$this._download(url,term,isSearch,whiteList,blackList,
					onSuccess,onError,onProgress);
};

FreePubDownloader.prototype.cancel = function(){
	_abort = true;
};	

FreePubDownloader.prototype._services = function(onSuccess,onError){
	$.ajax({
		type: "GET",
		url: _endpoint,
		success: function(result,textStatus,jqXHR){
			onSuccess(result);
		},
		error: function(jqXHR,textStatus,errorThrown){
			var error = jqXHR.responseText;
			var msg = "Error getting service list";
			if (error != undefined && error != null) error = JSON.parse(error);
			if (error != undefined && error != null) error = error.error;
			if (error != undefined && error != null){
				msg = msg + ": " + error;
			} else {
				msg = msg + '.';
			}
			onError(msg);
		}
	});
};

FreePubDownloader.prototype._search = function(url,term,page,size,
											   onSuccess,onError){
	if (page === undefined){ page = this.DEFAULT_INITIAL_PAGE; }
	if (size === undefined){ size = this.DEFAULT_PAGE_SIZE; }
	$.ajax({
		type: "POST",
		url: url,
		data: {'search':term,'size':size,'page':page},
		success: function(result,textStatus,jqXHR){
			onSuccess(result);
		},
		error: function(jqXHR,textStatus,errorThrown){
			var error = jqXHR.responseText;
			var msg = "Error searching publication(s) '" + term + "'";
			if (error != undefined && error != null) error = JSON.parse(error);
			if (error != undefined && error != null) error = error.error;
			if (error != undefined && error != null){
				msg = msg + ": " + error;
			} else {
				msg = msg + '.';
			}
			onError(msg);
		}
	});
};

FreePubDownloader.prototype._list = function(url,term,page,size,
											 onSuccess,onError){
	if (page === undefined){ page = this.DEFAULT_INITIAL_PAGE; }
	if (size === undefined){ size = this.DEFAULT_PAGE_SIZE; }
	$.ajax({
		type: "POST",
		url: url,
		data: {'url':term,'size':size,'page':page},
		success: function(result,textStatus,jqXHR){
			onSuccess(result);
		},
		error: function(jqXHR,textStatus,errorThrown){
			var error = jqXHR.responseText;
			var msg = "Error listing publication(s) '" + term + "'";
			if (error != undefined && error != null) error = JSON.parse(error);
			if (error != undefined && error != null) error = error.error;
			if (error != undefined && error != null){
				msg = msg + ": " + error;
			} else {
				msg = msg + '.';
			}
			onError(msg);
		}
	});
};

FreePubDownloader.prototype._download = function(url,term,isSearch,
							whiteList,blackList,onSuccess,onError,onProgress){
	var $this = this;
	var zip = new JSZip();
	_abort = false;
	var completed = new Set();
	$this._listAndDownload(zip,url,term,0,0,isSearch,whiteList,blackList,
						   completed,onSuccess,onError,onProgress);
};

FreePubDownloader.prototype._listAndDownload = function(zip,url,term,page,pub,
					isSearch,whiteList,blackList,completed,
					onSuccess,onError,onProgress){
	var $this = this;
	var data = isSearch 
		? ({'search':term,'page':page}) : ({'url':term,'page':page});
	$.ajax({
		type: "POST",
		url: url,
		data: data,
		success: function(data,textStatus,jqXHR){
			if (data == undefined || data.publications == undefined 
					|| data.publications == null){
				var msg = "Error getting publication(s) '" + 
					term + "': not found.";
				onError(msg);
				return;
			}
			var requested = data.total ? data.total : 1;
			var total = 0;
			if (whiteList !== undefined && whiteList.length){
				requested = whiteList.length;
			}
			if (blackList !== undefined && blackList.length){
				requested -= blackList.length;
			}
			if (requested <= 0){ requested = 1; }
			if (!data.publications.length && requested > 1){
				$this._saveZip(zip,$this._generateZipFilename(),
					onSuccess,onError,
					function(filename,perc){
						onProgress(Math.round(requested * perc / 100),
								   requested,Math.round(perc),
								   filename,1,1,100,2);
					});
				return;
			}
			$this._createDocuments(zip,url,data,whiteList,blackList,completed,
				function(processed,zip,doc,filename){
					total += processed;
					if (total < requested){
						page++;
						$this._listAndDownload(zip,url,term,page,pub,isSearch,
							whiteList,blackList,completed,
							onSuccess,onError,onProgress);
					} else {
						if (requested == 1 && doc !== undefined
								&& filename !== undefined){
							$this._savePdf(doc,filename,onSuccess);
							return;
						} else {
							$this._saveZip(zip,
								$this._generateZipFilename(),
								onSuccess,onError,
								function(filename,perc){
									onProgress(
										Math.round(requested * perc / 100),
										requested,Math.round(perc),
										filename,1,1,100,2
									);
								});
							return;
						}
					}
				},
				onError,
				function(title,page,pages,percPage){
					if (page == pages){pub++;}
					var pubs = (data.total ? data.total : 1);
					if (whiteList != undefined && whiteList.length){ 
						pubs = whiteList.length; 
					}
					if (blackList != undefined && blackList.length){ 
						pubs -= blackList.length; 
					}
					if (pub > pubs){pub = pubs;}
					var percPub = pub * 100 / pubs;
					if (page != pages){
						percPub += ((1 / pubs) * (page / pages) * 100) / pubs;
					}
					percPub = Math.round(percPub);
					onProgress(pub,pubs,percPub,title,page,pages,percPage,1);
				}
			);
		},
		error: function(jqXHR,textStatus,errorThrown){
			var error = jqXHR.responseText;
			var msg = "Error getting publication(s) '" + term + "'";
			if (error != undefined && error != null) error = JSON.parse(error);
			if (error != undefined && error != null) error = error.error;
			if (error != undefined && error != null){
				msg = msg + ": " + error;
			} else {
				msg = msg + '.';
			}
			onError(msg);
		}
	});
};

FreePubDownloader.prototype._createDocuments = function(zip,url,data,
							whiteList,blackList,completed,
							onSuccess,onError,onProgress){
	var $this = this;
	if (!data.publications.length){ onSuccess(0,zip); return;}
	var idx = 0, total = 0;
	$this._createAndAddDoc(zip,url,data,idx,total,whiteList,blackList,completed,
						   onSuccess,onError,onProgress);
};

FreePubDownloader.prototype._createAndAddDoc = function(zip,url,data,idx,total,
							whiteList,blackList,completed,
							onSuccess,onError,onProgress){
	if (_abort) { onError("Cancelled."); return; }
	var $this = this;
	var isToAdd = true;
	if (idx >= data.publications.length){ 
		isToAdd = false; 
	} else {
		var pub = data.publications[idx];
		var requested = data.total ? data.total : data.publications.length;
		if (completed.has(pub.id.toString())){ isToAdd = false; }
		if (whiteList !== undefined && whiteList.length){
			if (whiteList.indexOf(pub.id.toString()) == -1){ isToAdd = false; }
			requested = whiteList.length;
		}
		if (blackList !== undefined && blackList.length){
			if (blackList.indexOf(pub.id.toString()) != -1){ isToAdd = false; }
			requested -= blackList.length;
		}
	}
	if (isToAdd){
		total++;
		completed.add(pub.id.toString());
		var funcCreateDocument = function(pdata,pidx){
			var ppub = pdata.publications[pidx];
			if (ppub.username == undefined){ 
				ppub.username = pdata.username;
			}
			if (ppub.publisher == undefined){ 
				ppub.publisher = pdata.publisher;
			}
			$this._createDocument(ppub,
				function(doc,filename){
					$this._addToZip(zip,filename,doc);
					if (idx < data.publications.length && 
							total < requested){
						idx++;
						$this._createAndAddDoc(zip,url,data,idx,total,
							whiteList,blackList,completed,
							onSuccess,onError,onProgress);
					} else {
						onSuccess(total,zip,doc,filename);
						return;
					}
				},
				function(msg){
					onError(msg);
					return;
				},
				onProgress
			);
		};
		
		if (pub.pages == undefined || pub.pages.count <= 0){
			$this._list(url,pub.url,0,undefined,
				function(retData){
					if (retData == undefined 
							|| retData.publications == undefined 
							|| retData.publications == null 
							|| !retData.publications.length){
						var msg = "Error getting publication '" + 
							pub.url + "': not found.";
						onError(msg);
						return;
					}
					funcCreateDocument(retData,0);
				},
				function(msg){
					onError(msg);
					return;
				}
			);
		} else {
			funcCreateDocument(data,idx);
		}
	} else {
		if (idx < data.publications.length && total < requested){
			idx++;
			$this._createAndAddDoc(zip,url,data,idx,total,whiteList,blackList,
								   completed,onSuccess,onError,onProgress);
		} else {
			onSuccess(total,zip);
		}
	}
}

FreePubDownloader.prototype._createDocument = function(publication,
												onSuccess,onError,onProgress){
	var $this = this;
	var filename = $this._generatePdfFilename(publication.title.toString());
	onProgress(publication.title,0,publication.pages.count,0);
	var doc = null;
	var page = 1;
	$this._addPage(publication,doc,page,
		function(doc){
			if (_abort) { onError("Cancelled."); return; }
			doc.setPage(1);
			doc.deletePage(1);
			onSuccess(doc,filename);
		}, 
		function(msg){
			onError("Error generating PDF: " + msg);
		},
		function(page){
			if (_abort) { onError("Cancelled."); return; }
			var pages = (publication.pages.count != 0) 
				? publication.pages.count : 1;
			if (page > pages){ page = pages; };
			var percent = Math.round(page * 100 / pages);
			onProgress(publication.title,page,pages,percent);
		}
	);
};

FreePubDownloader.prototype._savePdf = function(doc,filename,onSuccess){
	doc.save(filename);
	onSuccess(filename);
};

FreePubDownloader.prototype._addToZip = function(zip,filename,doc){
	if (zip.file(filename) !== null){
		filename = filename.replace(/\.[^/.]+$/,"");
		filename += "_" + new Date().getTime().toString(16).toUpperCase() 
			+ "." + OUTPUT_DOCUMENT_TYPE;
	}
	zip.file(filename,doc.output('blob',filename));
};

FreePubDownloader.prototype._saveZip = function(zip,filename,
												onSuccess,onError,onProgress){
	var writer = null;
	try {
		writer = streamSaver.createWriteStream(filename).getWriter();
	} catch (e) { 
		onError("Error generating file '" + filename + "': " + e.message);
		return;
	}
	onProgress(filename,0);
	zip.generateInternalStream({
		type:"blob",
		compression:"DEFLATE",
		streamFiles:true,
		comment:"Created by "+PDF_CREATOR_APPNAME+"\n"+PDF_CREATOR_URL
	})
	.on('data', function(data,metadata){
		onProgress(metadata.currentFile,metadata.percent);
		writer.write(data);
	})
	.on('error', err => onError(err))
	.on('end', function(){ 
		writer.close(); 
		onSuccess(filename);
	})
	.resume();
};

FreePubDownloader.prototype._addPage = function(publication,doc,page,
												onSuccess,onError,onProgress){
	var $this = this;
	var url = publication.pages.url.replace("%d",page.toString());
	$this._getImageFile(url, "image/jpeg", page==1,
		function(content, w, h){
			if (content == null || content == undefined){ 
				onError("Error getting the page '" + page + 
						"' for publication ID '" + 
						publication.id.toString() + "'.");
				return; 
			}
			var o = (w <= h) ? 'p' : 'l';
			if (doc == null){
				doc = new jsPDF(o,'px',[w, h],false,true);
				doc = $this._setDocProps(doc, publication);
			}
			doc.addPage([w, h],o);
			doc.addImage(content, 'JPEG', 0, 0, w, h, '', 'FAST');
			if (onProgress) { onProgress(page); }
			page++;
			if (page > publication.pages.count) {
				onSuccess(doc);
				return;
			}
			if (_abort) { onError("Cancelled."); return; }
			$this._addPage(publication, doc, page,
					onSuccess, onError, onProgress);				
		},
		function(msg){
			if (_abort) { onError("Cancelled."); return; }
			onError(msg);
			return;
		}
	);
};

FreePubDownloader.prototype._generatePdfFilename = function(title){
	var filename = title;
	filename = filename.substr(0,100)
		.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
		.replace(/\u0142/g,"l").trim().replace(/[^a-zA-Z0-9]/g,"_")
		.replace(/_+/g,"_") + "." + OUTPUT_DOCUMENT_TYPE;
	return filename;
};

FreePubDownloader.prototype._generateZipFilename = function(){
	var filename = "fpubd_" + new Date().getTime().toString(16).toUpperCase() + 
		"." + OUTPUT_ZIP_TYPE;
	return filename;
};

FreePubDownloader.prototype._setDocProps = function(doc, publication){
	var tags = '', idx;
	var len = (publication.tags !== undefined) 
		? publication.tags.length : 0;
	for (idx = 0; idx < len; idx++) {
		if (idx != 0) tags += ' ';
		tags += publication.tags[idx].toString()
			.replace("\\","").replace("/",""); 
	}
	doc.setProperties({
		title   : (publication.title != undefined) 
						? publication.title.toString() : '',
		subject : (publication.description != undefined) 
						? publication.description.toString() : '',
		author  : (publication.publisher != undefined) 
						? publication.publisher.toString() : '',
		keywords: tags,
		creator : PDF_CREATOR_APPNAME
	});
	return doc;
};

FreePubDownloader.prototype._getImageFile = function(uri,mimeType,first,
													 onSuccess,onError) {
	var $this = this;
	var ntry = 0;
	if (typeof $this._getImageFile.canvasOK == 'undefined' || first){
		$this._getImageFile.canvasOK = true;
	}
	var funcGetImageByPrOnError = function(msg){
		ntry++;
		if (ntry >= GET_IMG_MAX_RETRY){
			$this._getImageFile.canvasOK = true;
			$this._getImageByCanvas(uri, mimeType, onSuccess, onError);
		} else {
			$this._getImageByPr(uri, mimeType, 
								onSuccess, funcGetImageByPrOnError);
		}
	};
	var funcGetImageByCanvasOnError = function(msg){
		ntry++;
		if (ntry >= GET_IMG_MAX_RETRY){
			$this._getImageFile.canvasOK = false;
			$this._getImageByPr(uri, mimeType, onSuccess, onError);
		} else {
			$this._getImageByCanvas(uri, mimeType, 
									onSuccess, funcGetImageByCanvasOnError);
		}
	};
	if ($this._getImageFile.canvasOK){
		$this._getImageByCanvas(uri, mimeType, 
								onSuccess, funcGetImageByCanvasOnError);
		return;
	} else {
		$this._getImageByPr(uri, mimeType, 
							onSuccess, funcGetImageByPrOnError);
		return;
	}
};

FreePubDownloader.prototype._getImageByCanvas = function(uri,mimeType,
														 onSuccess,onError){
	var img = new Image();
	img.onload = function() {
		try {
			var canvas = document.createElement("canvas");
			canvas.width = this.width;
			canvas.height = this.height;
			var ctx = canvas.getContext("2d");
			ctx.drawImage(this, 0, 0);
			var dataURL = canvas.toDataURL(mimeType,IMG_QUALITY);
			onSuccess(dataURL, img.width, img.height);
		} catch (e) { 
			onError("Error getting file '" + uri + "': " + e.message); 
		}
	};
	img.onerror = function() {
		onError("Error getting file '" + uri + "': Not loaded.");
	};
	try {
		img.setAttribute('crossOrigin', 'anonymous');
		img.src = uri;
	} catch (e) { 
		onError("Error getting file '" + uri + "': " + e.message); 
	}
};

FreePubDownloader.prototype._getImageByPr = function(uri,mimeType,
													 onSuccess,onError){
	var $this = this;
	var prUri = FREEPUBD_API_URL + 'imgdata.php?url=' + 
		encodeURIComponent(uri) + '&type=' + mimeType;
	$this._getImageByCanvas(prUri, mimeType, onSuccess, onError);
};
