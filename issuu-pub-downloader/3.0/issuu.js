/*----------------------------------------------------------------------------*/
/**
 * @fileOverview Issuu Publication Downloader
 * 
 * @author Robson Martins (robson@robsonmartins.com)
 * @version 3.0
 */
/*----------------------------------------------------------------------------*/
/* 
 *  Copyright (C) 2015 Robson S. Martins
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
 *   Simple PHP Proxy (https://github.com/cowboy/php-simple-proxy)
 * ---------------------------------------------------------------------------- 
 *  Example of use:
 *
 *  var downloader = new IssuuDownloader();
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
 *  var username = "username"; // optional
 *  var password = "password"; // optional
 *
 *  var uri = "publication_uri_at_issuu_com";
 *
 *  // download of one publication by URL
 *  downloader.getIssuuPDF(uri, username, password);
 *
 *  var author = "author_username_at_issuu_com";
 *
 *  // download of all publications by author
 *  downloader.getAllByAuthorIssuuPDF(author, username, password);
 *
 */
/*----------------------------------------------------------------------------*/
/**
 * @class Implements an Issuu Publication Downloader, saving any publications at
          Issuu as PDF.
 * @constructor
 * @description Create an object of this class.
 */
function IssuuDownloader() {
  
  /*-----------------------------------------------------------------------*/
  /* constants */

  /* ISSUU service URLs */
  var ISSUU_MAIN_URL          = 'http://issuu.com';
  var ISSUU_SEARCH_DOC_URL    = 'http://search.issuu.com/api/2_0/document?q=*&responseParams=*&documentId={documentId}';
  var ISSUU_SEARCH_ALL_URL    = 'http://search.issuu.com/api/2_0/document?q=*&responseParams=*&username={username}&pageSize={pageSize}&startIndex={startIndex}';
  var ISSUU_LOGIN_URL         = 'http://api.issuu.com/query?permission=f&loginExpiration=standard&action=issuu.user.login&format=json&username={username}&password={password}';
  var ISSUU_IMAGE_URL         = 'http://image.issuu.com/{documentId}/jpg/page_{page}.{extension}';
  
  /* Filetypes */
  var ISSUU_IMAGE_TYPE           = 'jpg';
  var ISSUU_OUTPUT_DOCUMENT_TYPE = 'pdf';

  /* PHP Proxy URLs (for cross-domain) */
  var CROSS_DOMAIN_URL        = 'ba-simple-proxy.php?send_cookies=1&send_session=1&url={url}';
  var CROSS_DOMAIN_NATIVE_URL = 'ba-simple-proxy.php?send_cookies=1&send_session=1&mode=native&url={url}';

  /* PDF creator name string */
  var PDF_CREATOR_APPNAME     = 'Issuu Publication Downloader';

  /*-----------------------------------------------------------------------*/
  /* vars */

  var publication_uri, /* Publication URI */
      author_name    , /* Author of many publications at Issuu */
      issuu_username , /* Username to login at Issuu (optional) */
      issuu_password , /* Password to login at Issuu (optional) */
      onSuccessEvent , /* OnSuccess Event */
      onProgressEvent, /* OnProgress Event */ 
      onErrorEvent   , /* OnError Event */
      abort_process = false; /* Cancel the current operation */

  
  /*-----------------------------------------------------------------------*/
  /* public API */

  /**
   * @memberOf IssuuDownloader 
   * @function
   * @description Gets the publication from Issuu as PDF.
   * @param {String} uri Publication URI at Issuu.
   * @param {String} username Username to login at Issuu (optional).
   * @param {String} password Password to login at Issuu (optional).
   */
  this.getIssuuPDF = function(uri, username, password) {
    abort_process = false;
    publication_uri = uri      || publication_uri;
    issuu_username  = username || issuu_username ;
    issuu_password  = password || issuu_password ;
    onSuccessEvent  = this.onSuccess;
    onProgressEvent = this.onProgress;
    onErrorEvent    = this.onError  ;
    if (issuu_username) {
      login(issuu_username, issuu_password, loginOK, eventNOK);
    } else {
      getPublicationId(publication_uri, getPublicationIdOK, eventNOK);
    }
  };
  
  /**
   * @memberOf IssuuDownloader 
   * @function
   * @description Gets all publications from Issuu by an author, as PDF.
   * @param {String} author Author of publications at Issuu (username).
   * @param {String} username Username to login at Issuu (optional).
   * @param {String} password Password to login at Issuu (optional).
   */
  this.getAllByAuthorIssuuPDF = function(author, username, password) {
    abort_process = false;
    author_name     = author   || author_name   ;
    issuu_username  = username || issuu_username;
    issuu_password  = password || issuu_password;
    onSuccessEvent  = this.onSuccess;
    onProgressEvent = this.onProgress;
    onErrorEvent    = this.onError  ;
    if (issuu_username) {
      login(issuu_username, issuu_password, loginAllByAuthorOK, eventNOK);
    } else {
      getPublicationsByAuthor(author_name, getPublicationsByAuthorOK, eventNOK);
    }
  };
  
  /**
   * @memberOf IssuuDownloader 
   * @function
   * @description Cancel the current operation.
   */
  this.cancel = function() {
    abort_process = true;
  };
  
  /**
   * @memberOf IssuuDownloader 
   * @event
   * @description Event triggered when a publication is downloaded with success.
   * @param {String} filename Publication filename (PDF).
   */
  this.onSuccess = function(filename){};

  /**
   * @memberOf IssuuDownloader 
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
   * @memberOf IssuuDownloader 
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
  function loginOK(username) {
    if (abort_process) { eventNOK("Cancelled."); return; }
    getPublicationId(publication_uri, getPublicationIdOK, eventNOK);
  };
  
  /** @private */
  function loginAllByAuthorOK(username) {
    if (abort_process) { eventNOK("Cancelled."); return; }
    getPublicationsByAuthor(author_name, getPublicationsByAuthorOK, eventNOK);
  };
  
  /** @private */
  function getPublicationIdOK(pubId) {
    if (abort_process) { eventNOK("Cancelled."); return; }
    getPublicationProperties(pubId, getPublicationPropertiesOK, eventNOK);
  };
  
  /** @private */
  function getPublicationPropertiesOK(pubProps) {
    if (abort_process) { eventNOK("Cancelled."); return; }
    buildPDF(pubProps, null, buildPDFOK, eventNOK, buildPDFProgress);
  };
  
  /** @private */
  function buildPDFOK(filename) {
    if (onSuccessEvent) { onSuccessEvent(filename); }
  };
  
  /** @private */
  function buildPDFProgress(pageNo,pageCount,percent) {
    if (onProgressEvent) { 
      onProgressEvent(pageNo,pageCount,1,1,percent); 
    }
  };
  
  /** @private */
  function getPublicationsByAuthorOK(pubPropsList) {
    if (abort_process) { eventNOK("Cancelled."); return; }
    buildMultiplePDF(pubPropsList, buildMultiplePDFOK,
                     eventNOK, buildMultiplePDFProgress);
  };
  
  /** @private */
  function buildMultiplePDFOK(len) {
    if (onSuccessEvent) { onSuccessEvent("publications: " + len); }
  };

  /** @private */
  function buildMultiplePDFProgress(pageNo,pageCount,pubNo,pubCount,percent) {
    if (onProgressEvent) { 
      onProgressEvent(pageNo,pageCount,pubNo,pubCount,percent); 
    }
  };
  
  /*-----------------------------------------------------------------------*/
  /* private main functions */

  /** @private */
  function login(username, pwd, callbackOk, callbackNok) {
    if (username == null || username == '' || username == undefined ||
        pwd      == null || pwd      == '' || pwd      == undefined) {
      callbackNok("Error: Empty username and/or password.");
      return;
    }
    var login_url = ISSUU_LOGIN_URL.format({username:username,password:pwd});
    getJson(login_url, 
            function(resp){
              var json_login = resp;
              if (json_login == null || json_login == undefined ||
                  json_login.rsp._content.user == undefined) { 
                callbackNok(
                  "Login error at Issuu (invalid username and/or password)."); 
                return; 
              }
              var user = json_login.rsp._content.user.username;
              callbackOk(user); 
            }, 
            callbackNok
    );
  };

  /** @private */
  function getPublicationId(publicationUrl, callbackOk, callbackNok) {
    if (publicationUrl == null || publicationUrl == '' || 
        publicationUrl == undefined) { 
      callbackNok("Error: Empty Publication URL.");
      return;
    }
    var pub_url = getPublicationUrl(publicationUrl);
    getXml(pub_url, 
           function(resp){
              var dom = resp;
              if (dom == null || dom == undefined) { 
                callbackNok("Error getting publication homepage from '" + 
                            pub_url + "'.");
                return; 
              }
              var node = getElementByDom(dom,"meta","property","og:video");
              var issuu_reader_url =
                (node != null) ? node.getAttribute("content") : null;
              if (issuu_reader_url == null || issuu_reader_url == '' || 
                  issuu_reader_url == undefined) { 
                callbackNok("Error getting publication ID from '" + 
                            pub_url + "'.");
                return; 
              }
              var doc_id = getParameterByName(issuu_reader_url, 'documentId');
              callbackOk(doc_id);
           }, 
           callbackNok
    );
  };

  /** @private */
  function getPublicationProperties(publicationId, callbackOk, callbackNok) {
    if (publicationId == null || publicationId == '' || 
        publicationId == undefined) {
      callbackNok("Error: Empty Publication ID.");
      return;
    }
    var docProps_url = ISSUU_SEARCH_DOC_URL.format({documentId:publicationId});
    getJson(docProps_url, 
            function(resp){
              var pub_props = resp;
              if (pub_props == null || pub_props == undefined) { 
                callbackNok("Error getting properties for publication ID '" + 
                            publicationId + "' at Issuu.");
                return; 
              }
              if (pub_props.response             == null      || 
                  pub_props.response             == undefined ||
                  pub_props.response.numFound    == 0         ||
                  pub_props.response.docs        == null      || 
                  pub_props.response.docs        == undefined ||
                  pub_props.response.docs.length == 0) { 
                callbackNok("Error: Publication with ID '" + publicationId + 
                            "' not found at Issuu.");
                return; 
              }
              pub_props = pub_props.response.docs[0];
              callbackOk(pub_props); 
            }, 
            callbackNok
    );
  };

  /** @private */
  function getPublicationsByAuthor(author, callbackOk, callbackNok) {
    if (author == null || author == '' || author == undefined) {
      callbackNok("Error: Empty author.");
      return;
    }
    var pubs = [];
    getPageOfSearchByAuthor(author, 0, 0, pubs, callbackOk, callbackNok);
  };

  /** @private */
  function buildPDF(publicationProps, filename, 
                    callbackOk, callbackNok, callbackProgress) {
    if (filename == null || filename == '' || filename == undefined) {
      filename = createFilenameToPDF(publicationProps);
    }
    var doc = new jsPDF('p','pt');
    doc = setDocumentProperties(doc, publicationProps);
    var pageNo = 1;
    addPage(publicationProps, doc, pageNo, 
      function(param){
        doc.setPage(1);
        doc.deletePage(1);
        doc.save(filename);
        callbackOk(filename);
      }, 
      function(msg){
        callbackNok("Error generating PDF: " + msg);
      },
      function(p){
        var percent = 
          p * 100 / 
          ((publicationProps.pagecount != 0) ? publicationProps.pagecount : 1);
        percent = Math.round(percent);
        callbackProgress(p, publicationProps.pagecount, percent);
      }
    );
  };

  /** @private */
  function buildMultiplePDF(pubPropsList, callbackOk,
                            callbackNok, callbackProgress) {
    var pubProps, idx, totalPages = 0;
    var len = pubPropsList.length;
    for (idx = 0; idx < len; idx++) {
      pubProps = pubPropsList[idx];
      totalPages += pubProps.pagecount;
    }    
    buildPDFList(pubPropsList, 1, 0, totalPages,
                 callbackOk, callbackNok, callbackProgress);
  };

  /*-----------------------------------------------------------------------*/
  /* private functions */

  /** @private */
  function buildPDFList(pubPropsList, currentPub, currentPage, totalPages,
                        callbackOk, callbackNok, callbackProgress) {
    var len = pubPropsList.length;
    var pubProps = pubPropsList[currentPub];
    var filename = createFilenameToPDF(pubProps);
    buildPDF(pubProps, filename, 
             function(f){
               currentPub++;
               if (currentPub > len) {
                 callbackOk(len);
                 return;
               }
               if (abort_process) { callbackNok("Cancelled."); return; }
               buildPDFList(pubPropsList, currentPub, currentPage,
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
  function getPageOfSearchByAuthor(author, pageNo, pubCount, pubs,
                                   callbackOk, callbackNok) {
    var pageSize = 20;                                   
    var url = ISSUU_SEARCH_ALL_URL.format(
      {username:author, pageSize:pageSize, startIndex:pageNo});
    getJson(url,
            function(props){
              if (props == null || props == undefined) { 
                callbackNok(
                  "Error getting properties for publications by author '" + 
                  author + "'.");
                return; 
              }
              if (props.response             == null      || 
                  props.response             == undefined ||
                  props.response.numFound    == 0         ||
                  props.response.docs        == null      || 
                  props.response.docs        == undefined ||
                  props.response.docs.length == 0) { 
                callbackNok("Error: No publications by author '" + author + 
                            "' found at Issuu.");
                return; 
              }
              if (pubCount == 0) { 
                pubCount = props.response.numFound;
              }
              pubs = pubs.concat(props.response.docs);
              pageNo += pageSize;
              if (pageNo >= pubCount) {
                callbackOk(pubs);
                return;
              }              
               if (abort_process) { callbackNok("Cancelled."); return; }
              getPageOfSearchByAuthor(author, pageNo, pubCount, pubs,
                                      callbackOk, callbackNok);
            },
            callbackNok
    );
  };

  /** @private */
  function addPage(publicationProps, doc, pageNo,
                   callbackOk, callbackNok, callbackProgress) {
    getImgForPage(publicationProps, pageNo,
                  function(page_content, w, h){
                    var imgData = page_content;
                    doc.addPage(w, h);
                    doc.addImage(imgData, 'JPEG', 0, 0, w, h);
                    if (callbackProgress) { callbackProgress(pageNo); }
                    pageNo++;
                    if (pageNo > publicationProps.pagecount) {
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
    var page_url = 
      ISSUU_IMAGE_URL.format({documentId:publicationProps.documentId,
                              page:pageNo, extension:ISSUU_IMAGE_TYPE});
    getImageFile(page_url, "image/jpeg", 
                 function(page_content, w, h){
                   if (page_content == null || page_content == undefined) { 
                     callbackNok("Error getting the page '" + pageNo + 
                                 "' for publication ID '" + 
                                 publicationProps.documentId + "' at Issuu.");
                     return; 
                   }
                   callbackOk(page_content, w, h); 
                 }, 
                 callbackNok
    );
  };

  /** @private */
  function setDocumentProperties(doc, publicationProps) {
    var tags = '', idx, len = publicationProps.tag.length;
    for (idx = 0; idx < len; idx++) {
      if (idx != 0) tags += ' ';
      tags += publicationProps.tag[idx]; 
    }
    doc.setProperties(
      {title   : publicationProps.title,
       subject : publicationProps.description,
       author  : publicationProps.username,
       keywords: tags,
       creator : PDF_CREATOR_APPNAME
      }
    );
    return doc;
  };

  /** @private */
  function createFilenameToPDF(pubProps) {
    var filename = pubProps.title || pubProps.docname || pubProps.description ||
                   pubProps.documentId;
    filename = filename.substr(0,100);
    filename = encodeURIComponent(filename).trim() + 
               "." + ISSUU_OUTPUT_DOCUMENT_TYPE;
    return filename;
  };

  /** @private */
  function getPublicationUrl(baseUrl) {
    if (baseUrl == null || baseUrl == '' || baseUrl == undefined) { 
      return null; 
    }
    var result = baseUrl;
    if (result.toLowerCase().indexOf(ISSUU_MAIN_URL.toLowerCase()) != 0) {
      if (result.indexOf('/') != 0) {
        result = '/' + result;
      }
      result = ISSUU_MAIN_URL + result;
    }
    return result;
  };

  /*-----------------------------------------------------------------------*/
  /* private auxiliary functions */

  /** @private */
  function getElementByDom(node, tag, attr, attr_val) {
    var tagList = node.getElementsByTagName(tag);
    var idx;
    var node_found = null;
    for (idx = 0; idx < tagList.length; idx++) {
      var element = tagList.item(idx);
      if (attr_val != null && attr_val != undefined) {
        if (element.getAttribute(attr) == attr_val) {
          node_found = element;
          break;          
        }
      } else {
        if (element.hasAttribute(attr)) {
          node_found = element;
          break;          
        }
      }
    }
    return node_found;
  };

  /** @private */
  function getXml(uri, callbackOk, callbackNok) {
    try {
      getFile(uri, 
              function(resp){
                var response = textToXML(resp);
                callbackOk(response);
              }, 
              callbackNok);
    } catch (e) { 
      callbackNok("Error getting file '" + uri + "': " + e.message); 
    }
  };

  /** @private */
  function getJson(uri, callbackOk, callbackNok) {
    try {
      getFile(uri, 
              function(resp){
                var response = JSON.parse(resp);
                callbackOk(response);
              }, 
              callbackNok);
    } catch (e) { 
      callbackNok("Error getting file '" + uri + "': " + e.message); 
    }
  };

  /** @private */
  function getRawFile(uri, callbackOk, callbackNok) {
    var xduri = CROSS_DOMAIN_NATIVE_URL.format({url:encodeURIComponent(uri)});
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', xduri, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var response = xhr.responseText;
            if (response != null) {
              callbackOk(response);
            } else {
              callbackNok("Error getting file '" + uri + "': Null response.");          
            }
          } else {
            callbackNok("Error getting file '" + uri + 
                        "': HTTP code " + xhr.status);          
          }
        }
      };
      xhr.send(null);
    } catch (e) { 
      callbackNok("Error getting file '" + uri + "': " + e.message); 
    }
  };

  /** @private */
  function getFile(uri, callbackOk, callbackNok) {
    var xduri = CROSS_DOMAIN_URL.format({url:encodeURIComponent(uri)});
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', xduri, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var response = xhr.responseText;
            if (response != null) {
              response = JSON.parse(response);
            }
            if (response != null) {
              response = response.contents;
            }
            if (response != null) {
              if (typeof response === 'object') {
                 response = JSON.stringify(response);
              }
              callbackOk(response);
            } else {
              callbackNok("Error getting file '" + uri + "': Null response.");          
            }
          } else {
              callbackNok("Error getting file '" + uri + 
                          "': HTTP code " + xhr.status);          
          }
        }
      };
      xhr.send(null);
    } catch (e) { 
      callbackNok("Error getting file '" + uri + "': " + e.message); 
    }
  };

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

  /** @private */
  function textToXML(txt) {
    var parser = null;
    var xmlDoc = null;
    if (window.DOMParser){
      parser = new DOMParser();
      xmlDoc = parser.parseFromString(txt,"text/html");
    } else {
      xmlDoc = new ActiveXObject("Microsoft.XMLHTTP");
      xmlDoc.async = false;
      xmlDoc.loadXML(txt);
    } 
    return xmlDoc;
  };

  /** @private */
  function getParameterByName(uri, name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(uri);
    return results === null ? "" : 
             decodeURIComponent(results[1].replace(/\+/g, " "));
  };

  /** @private */
  if (!String.prototype.format) {
    String.prototype.format = function() {
      var str = this.toString();
      if (!arguments.length) { return str; }
      var args = typeof arguments[0],
      args = 
        (("string" == args || "number" == args) ? arguments : arguments[0]);
      for (arg in args) {
        str = str.replace(RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
      }
      return str;
    }
  };
  
};