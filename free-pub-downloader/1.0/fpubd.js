/*----------------------------------------------------------------------------*/
/**
 * @fileOverview Free Publication Downloader
 * 
 * @author Robson Martins (https://robsonmartins.com)
 * @version 1.0
 */
/*----------------------------------------------------------------------------*/
/* 
 *  Copyright (C) 2020 Robson S. Martins
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
 *   Backend (REST API)
 * ---------------------------------------------------------------------------- 
 *  Example of use:
 *
 *  var downloader = new FreePubDownloader();
 *
 *  downloader.onSuccess = function(filename){
 *    // success: pdfFilename = filename;
 *  };
 *  downloader.onError = function(msg){
 *    // error: errorMessage = msg;
 *  };
 *  downloader.onProgress = function(curPage, totalPages, 
 *                                   curPub, totalPubs, percent){
 *    // progress: currentPageOfPublication = curPage; 
 *    //           totalPagesOfPublication  = totalPages;
 *    //           currentPublication       = curPub;
 *    //           totalOfPublications      = totalPubs;
 *    //           totalPercentProgress     = percent;
 *  };
 * 
 *  var endpoint = "service_backend_endpoint"; // backend API URL
 *  
 *  var username = "username"; // optional
 *  var password = "password"; // optional
 *
 *  var uri = "publication_uri_or_id";
 * 
 *  // get services list
 *  downloader.listServices(endpoint, 
 *                          function(data){onSuccess}, 
 *                          function(msg){onError});
 * 
 *  // download of one publication by URL
 *  downloader.getPDF(endpoint, uri, username, password);
 *
 *  var author = "author_username";
 *
 *  // download of all publications by author
 *  downloader.getAllByAuthorPDF(endpoint, author, username, password);
 *
 */
/*----------------------------------------------------------------------------*/
/**
 * @class Implements an Free Publication Downloader, saving any publications 
 *        as PDF.
 * @constructor
 * @description Create an object of this class.
 */
function FreePubDownloader() {
	
	/*-----------------------------------------------------------------------*/
	/* constants */

	/* Filetypes */
	var OUTPUT_DOCUMENT_TYPE = 'pdf';

	/* PDF creator name string */
	var PDF_CREATOR_APPNAME     = 'Free Publication Downloader';

	/*-----------------------------------------------------------------------*/
	/* vars */

	var onSuccessEvent , /* OnSuccess Event */
		onProgressEvent, /* OnProgress Event */ 
		onErrorEvent   , /* OnError Event */
		abort_process = false; /* Cancel the current operation */

	
	/*-----------------------------------------------------------------------*/
	/* public API */

	/**
	 * @memberOf FreePubDownloader 
	 * @function
	 * @description Gets the Download Services List.
	 * @param {String} endpoint URL of API endpoint.
	 */
	this.listServices = function(endpoint,onSuccess,onError) {
		getServiceList(endpoint,onSuccess,onError);
	};


	/**
	 * @memberOf FreePubDownloader 
	 * @function
	 * @description Gets the publication as PDF.
	 * @param {String} endpoint URL of API endpoint.
	 * @param {String} uri Publication URI or ID.
	 * @param {String} username Username to login (optional).
	 * @param {String} password Password to login (optional).
	 */
	this.getPDF = function(endpoint, uri, username, password) {
		abort_process   = false;
		onSuccessEvent  = this.onSuccess;
		onProgressEvent = this.onProgress;
		onErrorEvent    = this.onError  ;
		getPublicationInfo(endpoint, uri, undefined, username, password,
			getPublicationInfoOK, eventNOK);
	};
	
	/**
	 * @memberOf FreePubDownloader 
	 * @function
	 * @description Gets all publications by an author, as PDF.
	 * @param {String} endpoint URL of API endpoint.
	 * @param {String} author Author of publications (username).
	 * @param {String} username Username to login (optional).
	 * @param {String} password Password to login (optional).
	 */
	this.getAllByAuthorPDF = function(endpoint, author, username, password) {
		abort_process   = false;
		onSuccessEvent  = this.onSuccess;
		onProgressEvent = this.onProgress;
		onErrorEvent    = this.onError  ;
		getPublicationInfo(endpoint, undefined, author, username, password,
			getPublicationInfoOK, eventNOK);
	};
	
	/**
	 * @memberOf FreePubDownloader 
	 * @function
	 * @description Cancel the current operation.
	 */
	this.cancel = function() {
		abort_process = true;
	};
	
	/**
	 * @memberOf FreePubDownloader 
	 * @event
	 * @description Event triggered when a publication is downloaded with success.
	 * @param {String} filename Publication filename (PDF).
	 * @param {Number} len Number of publications.
	 */
	this.onSuccess = function(filename,len){};

	/**
	 * @memberOf FreePubDownloader 
	 * @event
	 * @description Event triggered while a publication is downloading.
	 * @param {Number} curPage Number of actual page.
	 * @param {Number} totalPages Total number of pages.
	 * @param {Number} curPub Number of actual publication.
	 * @param {Number} totalPubs Total number of publications.
	 * @param {Number} percent Percent of conclusion.
	 */
	this.onProgress = function(curPage,totalPages,curPub,totalPubs,percent){};

	/**
	 * @memberOf FreePubDownloader 
	 * @event
	 * @description Event triggered when an error occurs.
	 * @param {String} msg Error message string.
	 */
	this.onError = function(msg){};

	/*-----------------------------------------------------------------------*/
	/* private callbacks */

	/** @private */
	function eventNOK(msg) {
		if (onErrorEvent) { onErrorEvent(msg); }
	};
	
	/** @private */
	function getPublicationInfoOK(pubs) {
		if (abort_process) { eventNOK("Cancelled."); return; }
		buildMultiplePDF(pubs, buildMultiplePDFOK,
						 eventNOK, buildMultiplePDFProgress);
	};
	
	/** @private */
	function buildMultiplePDFOK(filename,len) {
		if (onSuccessEvent) { onSuccessEvent(filename,len); }
	};

	/** @private */
	function buildMultiplePDFProgress(pageNo,pageCount,pubNo,pubCount,percent) {
		if (onProgressEvent) { 
			onProgressEvent(pageNo,pageCount,pubNo+1,pubCount,percent); 
		}
	};
	
	/*-----------------------------------------------------------------------*/
	/* private main functions */

	/** @private */
	function getServiceList(endpoint,onSuccess,onError) {
		$.ajax({
			type: "GET",
			url: endpoint,
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

	/** @private */
	function getPublicationInfo(endpoint, url, author, user, pass, 
								callbackOk, callbackNok) {
		$.ajax({
			type: "POST",
			url: endpoint,
			data: {'url':url,'author':author,'username':user,'password':pass},
			success: function(result,textStatus,jqXHR){
				callbackOk(result);
			},
			error: function(jqXHR,textStatus,errorThrown){
				var error = jqXHR.responseText;
				var msg = "Error getting publication info '" + url + "'";
				if (error != undefined && error != null) error = JSON.parse(error);
				if (error != undefined && error != null) error = error.error;
				if (error != undefined && error != null){
					msg = msg + ": " + error;
				} else {
					msg = msg + '.';
				}
				callbackNok(msg);
			}
		});
	};

	/** @private */
	function buildPDF(publicationProps, filename, 
					callbackOk, callbackNok, callbackProgress) {
		if (filename == null || filename == '' || filename == undefined) {
			filename = createFilenameToPDF(publicationProps.title.toString());
		}
		var doc = new jsPDF('p','pt');
		doc = setDocumentProperties(doc, publicationProps);
		var pageNo = 1;
		addPage(publicationProps, doc, pageNo, 
			function(param){
				doc.setPage(1);
				doc.deletePage(1);
				var isSafari = false;
				try { 
					if (safari != undefined && typeof safari !== "undefined"){
						isSafari = true;
					}
				} catch(e){}
				if (isSafari){
					var bloburl = doc.output('bloburl',filename);
					callbackOk(bloburl);
				} else {
					doc.save(filename);
					callbackOk(filename);
				}
			}, 
			function(msg){
				callbackNok("Error generating PDF: " + msg);
			},
			function(p){
				var percent = 
					p * 100 / 
					((publicationProps.pages.count != 0) ? publicationProps.pages.count : 1);
				percent = Math.round(percent);
				callbackProgress(p, publicationProps.pages.count, percent);
			}
		);
	};

	/** @private */
	function buildMultiplePDF(pubs, callbackOk,	callbackNok, callbackProgress) {
		var pubProps, idx, totalPages = 0;
		var len = pubs.count;
		if (len === 0) { callbackNok("Publication not found."); return; }
		for (idx = 0; idx < len; idx++) {
			pubProps = pubs.publications[idx];
			totalPages += pubProps.pages.count;
		}    
		buildPDFList(pubs, 0, 0, totalPages,
					 callbackOk, callbackNok, callbackProgress);
	};

	/*-----------------------------------------------------------------------*/
	/* private functions */

	/** @private */
	function buildPDFList(pubs, currentPub, currentPage, totalPages,
						callbackOk, callbackNok, callbackProgress) {
		var len = pubs.count;
		var pubProps = pubs.publications[currentPub];
		var filename = createFilenameToPDF(pubProps.title.toString());
		pubProps.publisher = pubs.publisher;
		buildPDF(pubProps, filename, 
				 function(f){
					currentPub++;
					if (currentPub >= len) {
						callbackOk(f,len);
						return;
					}
					if (abort_process) { callbackNok("Cancelled."); return; }
					buildPDFList(pubs, currentPub, currentPage,
								 totalPages, callbackOk, callbackNok, callbackProgress);
					}, 
					callbackNok, 
					function(pageNo,pageCount,percent){
						if (abort_process) { callbackNok("Cancelled."); return; }
						currentPage++;
						percent =
							(totalPages != 0) 
								 ? Math.round(currentPage * 100 / totalPages) 
								 : 100;
						callbackProgress(pageNo,pageCount,currentPub,len,percent);
					}
		);
	};

	/** @private */
	function addPage(publicationProps, doc, pageNo,
					 callbackOk, callbackNok, callbackProgress) {
		getImgForPage(publicationProps, pageNo,
						function(page_content, w, h){
							var imgData = page_content;
							doc.addPage([w, h]);
							doc.addImage(imgData, 'JPEG', 0, 0, w, h);
							if (callbackProgress) { callbackProgress(pageNo); }
							pageNo++;
							if (pageNo > publicationProps.pages.count) {
								callbackOk(true);
								return;
							}
							if (abort_process) { callbackNok("Cancelled."); return; }
							addPage(publicationProps, doc, pageNo,
									callbackOk, callbackNok, callbackProgress);
						},
						callbackNok
		);
	};

	/** @private */
	function getImgForPage(publicationProps, pageNo, callbackOk, callbackNok) {
		var page_url = publicationProps.pages.url.replace("%d",pageNo.toString());
		getImageFile(page_url, "image/jpeg", 
					 function(page_content, w, h){
						 if (page_content == null || page_content == undefined) { 
							 callbackNok("Error getting the page '" + pageNo + 
										 "' for publication ID '" + 
										 publicationProps.id.toString() + "'.");
							 return; 
						 }
						 callbackOk(page_content, w, h); 
					 }, 
					 callbackNok
		);
	};

	/** @private */
	function setDocumentProperties(doc, publicationProps) {
		var tags = '', idx;
		var len = (publicationProps.tags !== undefined) 
			? publicationProps.tags.length : 0;
		for (idx = 0; idx < len; idx++) {
			if (idx != 0) tags += ' ';
			tags += publicationProps.tags[idx].toString(); 
		}
		doc.setProperties(
			{title   : (publicationProps.title != undefined) ? publicationProps.title.toString() : '',
			 subject : (publicationProps.description != undefined) ? publicationProps.description.toString() : '',
			 author  : (publicationProps.publisher != undefined) ? publicationProps.publisher.toString() : '',
			 keywords: tags,
			 creator : PDF_CREATOR_APPNAME
			}
		);
		return doc;
	};

	/** @private */
	function createFilenameToPDF(title) {
		var filename = title;
		filename = filename.substr(0,100);
		filename = encodeURIComponent(filename).trim() + 
							 "." + OUTPUT_DOCUMENT_TYPE;
		return filename;
	};

	/*-----------------------------------------------------------------------*/
	/* private auxiliary functions */

	/** @private */
	function getImageFile(uri, mimeType, callbackOk, callbackNok) {
		var img = new Image();
		img.onload = function() {
			try {
				var canvas = document.createElement("canvas");
				canvas.width =this.width;
				canvas.height =this.height;
				var ctx = canvas.getContext("2d");
				ctx.drawImage(this, 0, 0);
				var dataURL = canvas.toDataURL(mimeType);
				callbackOk(dataURL, img.width, img.height);
			} catch (e) { 
				callbackNok("Error getting file '" + uri + "': " + e.message); 
			}
		};
		img.onerror = function() {
			callbackNok("Error getting file '" + uri + "': Not loaded.");
		};
		try {
			img.setAttribute('crossOrigin', 'anonymous');
			img.src = uri;
		} catch (e) { 
			callbackNok("Error getting file '" + uri + "': " + e.message); 
		}
	};
	
};
