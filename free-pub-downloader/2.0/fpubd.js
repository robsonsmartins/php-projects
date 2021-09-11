/*----------------------------------------------------------------------------*/
/**
 * @fileOverview Free Publication Downloader
 * 
 * @author Robson Martins (https://robsonmartins.com)
 * @version 2.0.1
 */
/*----------------------------------------------------------------------------*/
/* 
 *  Copyright (C) 2021 Robson S. Martins
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
 *   Backend (REST API)
 */
/*----------------------------------------------------------------------------*/

var FreePubDownloader = function(endpoint){
	PDF_CREATOR_APPNAME  = 'Free Publication Downloader';
	PDF_CREATOR_URL      = 'https://robsonmartins.com/content/info/fpubd/';
	OUTPUT_DOCUMENT_TYPE = 'pdf';
	OUTPUT_ZIP_TYPE      = 'zip';
	DEFAULT_INITIAL_PAGE =  0;
	DEFAULT_PAGE_SIZE    = 10;
	GET_IMG_MAX_RETRY    =  3;
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
	$this._listAndDownload(zip,url,term,0,0,isSearch,whiteList,blackList,
						   onSuccess,onError,onProgress);
};

FreePubDownloader.prototype._listAndDownload = function(zip,url,term,page,pub,
					isSearch,whiteList,blackList,onSuccess,onError,onProgress){
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
				$this._saveZip(zip,$this._generateZipFilename(),onSuccess);
				return;
			}
			$this._createDocuments(zip,url,data,whiteList,blackList,
				function(processed,zip,doc,filename){
					total += processed;
					if (total < requested){
						page++;
						$this._listAndDownload(zip,url,term,page,pub,isSearch,
							whiteList,blackList,onSuccess,onError,onProgress);
					} else {
						if (requested == 1 && doc !== undefined
								&& filename !== undefined){
							$this._savePdf(doc,filename,onSuccess);
							return;
						} else {
							$this._saveZip(zip,
								$this._generateZipFilename(),onSuccess);
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
					var percPub = pub * 100 / pubs;
					if (page != pages){
						percPub += ((1 / pubs) * (page / pages) * 100) / pubs;
					}
					percPub = Math.round(percPub);
					onProgress(pub,pubs,percPub,title,page,pages,percPage);
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
							whiteList,blackList,onSuccess,onError,onProgress){
	var $this = this;
	if (!data.publications.length){ onSuccess(0,zip); return;}
	var idx = 0, total = 0;
	$this._createAndAddDoc(zip,url,data,idx,total,whiteList,blackList,
						   onSuccess,onError,onProgress);
};

FreePubDownloader.prototype._createAndAddDoc = function(zip,url,data,idx,total,
							whiteList,blackList,onSuccess,onError,onProgress){
	if (_abort) { onError("Cancelled."); return; }
	var $this = this;
	var isToAdd = true;
	var pub = data.publications[idx];
	var requested = data.total ? data.total : data.publications.length;
	if (whiteList !== undefined && whiteList.length){
		if (whiteList.indexOf(pub.id.toString()) == -1){ isToAdd = false; }
		requested = whiteList.length;
	}
	if (blackList !== undefined && blackList.length){
		if (blackList.indexOf(pub.id.toString()) != -1){ isToAdd = false; }
		requested -= blackList.length;
	}
	if (isToAdd){
		total++;

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
							whiteList,blackList,
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
								   onSuccess,onError,onProgress);
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
			var percent = 
				page * 100 / 
				((publication.pages.count != 0) ? publication.pages.count : 1);
			percent = Math.round(percent);
			onProgress(publication.title,page,publication.pages.count,percent);
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

FreePubDownloader.prototype._saveZip = function(zip,filename,onSuccess){
	zip.generateAsync({
			type:"blob",
			compression:"STORE",
			comment:"Created by "+PDF_CREATOR_APPNAME+"\n"+PDF_CREATOR_URL
		}).then(function(content){
		saveAs(content,filename);
		onSuccess(filename);
	});
};

FreePubDownloader.prototype._addPage = function(publication,doc,page,
												onSuccess,onError,onProgress){
	var $this = this;
	var url = publication.pages.url.replace("%d",page.toString());
	var ntry = 0;
	var funcGetImageFileOnSuccess = function(content, w, h){
		if (content == null || content == undefined){ 
			onError("Error getting the page '" + page + 
					"' for publication ID '" + 
					publication.id.toString() + "'.");
			return; 
		}
		var o = (w <= h) ? 'p' : 'l';
		if (doc == null){
			doc = new jsPDF({unit:'px',format:[w, h],orientation:o});
			doc = $this._setDocProps(doc, publication);
		}
		doc.addPage({format:[w, h],orientation:o});
		doc.addImage(content, 'JPEG', 0, 0, w, h);
		if (onProgress) { onProgress(page); }
		page++;
		if (page > publication.pages.count) {
			onSuccess(doc);
			return;
		}
		if (_abort) { onError("Cancelled."); return; }
		$this._addPage(publication, doc, page,
				onSuccess, onError, onProgress);				
	}; 
	var funcGetImageFileOnError = function(msg){
		ntry++;
		if (_abort) { onError("Cancelled."); return; }
		if (ntry >= GET_IMG_MAX_RETRY){
			onError(msg);
			return;
		} else {
			$this._getImageFile(url, "image/jpeg", true,
				funcGetImageFileOnSuccess, funcGetImageFileOnError);
		}
	};
	$this._getImageFile(url, "image/jpeg", page==1,
		funcGetImageFileOnSuccess, funcGetImageFileOnError);		
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
	if (typeof $this._getImageFile.canvasOK == 'undefined' || first){
		$this._getImageFile.canvasOK = true;
	}
	if ($this._getImageFile.canvasOK){
		$this._getImageByCanvas(uri, mimeType, onSuccess, function(msg){
			$this._getImageFile.canvasOK = false;
			$this._getImageByPr(uri, mimeType, onSuccess, onError);
		});
	} else {
		$this._getImageByPr(uri, mimeType, onSuccess, onError);
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
			var dataURL = canvas.toDataURL(mimeType);
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