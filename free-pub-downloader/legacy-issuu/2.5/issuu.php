<?php
/* ---------------------------------------------------------------------------- 
 *  Issuu Publication Downloader (v.2.5)
 * ---------------------------------------------------------------------------- 
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
 * Requirements: 
 *
 *  util/fpdf.php      (FPDF Library)     <http://www.fpdf.org/>
 *  util/fpdf2file.php (FPDF2File Add-On) <http://fpdf.de/downloads/addons/76/>
 *  
 * Note:
 *  The FPDF Library used in this version was changed in line 279:
 *  
 *    // die('<b>FPDF error:</b> '.$msg);
 *	  throw new Exception('FPDF error: '.$msg);
 * 
 * ---------------------------------------------------------------------------- 
 *  Example of use:
 *
 *  <?php require_once('issuu.php');
 *
 *    $pub_url  = 'author/docs/pubname';
 *    $email    = 'myuser@issuu';
 *    $password = 'mypassword';
 *
 *    $issuu = new IssuuDownloader();
 *
 *    if (!$issuu->login($email, $password)) {
 *      echo 'Unauthorized: Invalid e-mail or password';
 *      exit(-1);
 *    }
 *    $pub_url = $issuu->getPublicationUrl($pub_url);
 *    if ($pub_url == null) {
 *      echo 'Publication not found';
 *      exit(-1);
 *    }
 *    $pub_id = $issuu->getPublicationId($pub_url);
 *    if ($pub_id == null) { 
 *      echo 'Publication ID not found';
 *      exit(-1);
 *    }
 *    $doc_properties = $issuu->getPublicationProperties($pub_id);
 *    if ($doc_properties == null) { 
 *      echo 'Publication properties not found (unauthorized?)';
 *      exit(-1);
 *    }
 *    $doc_info = $issuu->createDocumentInfo($doc_properties);
 *    if ($doc_info == null) { 
 *      echo 'Error getting document information';
 *      exit(-1);
 *    }
 *    $pdf_fname = $issuu->createPdf($doc_info);
 *    if ($pdf_fname == null) {
 *      echo 'Error creating PDF document';
 *      exit(-1);
 *    }
 *    // Do download of PDF file: real temporary file in $pdf_fname
 *    // Virtual filename in $doc_info['filename']
 *
 *    $issuu->deletePdf($pdf_fname); // removes temporary file
 *  ?>    
 * ---------------------------------------------------------------------------- 
 */
require_once('util/fpdf2file.php');

class IssuuDownloader {
  
  const ISSUU_MAIN_URL       = 'http://issuu.com';
  const ISSUU_SEARCH_DOC_URL = 'http://search.issuu.com/api/2_0/document?q=%%2A&responseParams=%%2A&documentId=%s';
  const ISSUU_SEARCH_ALL_URL = 'http://search.issuu.com/api/2_0/document?q=%%2A&responseParams=%%2A&username=%s&pageSize=%d&startIndex=%d';
  const ISSUU_LOGIN_URL      = 'https://api.issuu.com/query?permission=f&loginExpiration=standard&action=issuu.user.login&format=json&username=%s&password=%s';
  const ISSUU_IMAGE_URL      = 'http://image.issuu.com/%s/jpg/page_%d.%s';
  const ISSUU_COOKIE         = 'site.model.username=%s; site.model.token=%s';
  
  const ISSUU_IMAGE_TYPE           = 'jpg';
  const ISSUU_OUTPUT_DOCUMENT_TYPE = 'pdf';
  const ISSUU_TMP_FILE_PREFIX      = 'issuu';
  const TEMP_DIR                   = '/tmp';
  
  const PHP_TIME_LIMIT         = 800;
  const FPDF_IMAGE_DPI         =  72;
  const CURL_CONNECTIONS_LIMIT =  50;
  const CURL_MAX_RETRY         =   5;
  
  const FILE_READ_CHUNK_SIZE   = 8192;
  const PDF_CREATOR_APPNAME    = 'Issuu Publication Downloader';
  
  private $username    = null;
  private $token       = null;
  private $last_images = null;

  public function __construct() {
    ignore_user_abort(true);
    set_time_limit(self::PHP_TIME_LIMIT);
  }

  public function __destruct() {
    if ($this->last_images != null) {
      @$this->deleteTmpImages(@$this->last_images);
    }
  }
  
  public function login($email, $password) {
    if ($email == null || $email == '' || $password == null || $password == '') {
      return false;
    }
    $json_login = null;
    $login_url = sprintf(self::ISSUU_LOGIN_URL, $email, $password);
    try {
      $json_login = @json_decode($this->downloadFile($login_url), true);
    } catch (Exception $e) { $json_login = null; }
    if ($json_login == null) { return false; }
    $this->token    = @$json_login['rsp']['token'];
    $this->username = @$json_login['rsp']['_content']['user']['username'];
    return true;
  }

  public function searchForPublications($author) {
    if ($author == null || $author == '') { return null; }
    $publications = array();
    $page_size  = 20;
    $page_index =  0;
    $num_docs   =  0;
    $pub_idx    =  0;
    do {
      $search_url = 
        sprintf(self::ISSUU_SEARCH_ALL_URL, $author, $page_size, $page_index);
      try {
        $docs = 
          @json_decode($this->downloadFile($search_url), true);
      } catch (Exception $e) { $docs = null; }
      if ($docs == null) { break; }
      if ($num_docs == 0) {
        $num_docs = @$docs['response']['numFound'];
        if ($num_docs == null || $num_docs == '') { $num_docs = 0; }
      }
      if ($num_docs == 0) { break; }
      $doc_prop_list = @$docs['response']['docs'];
      foreach ($doc_prop_list as $doc_prop) {
        $publications[$pub_idx]['response']['docs'][0] = $doc_prop;
        $publications[$pub_idx]['response']['numFound'] = 1;
        $pub_idx++;
      }
      $page_index += $page_size;
    } while ($page_index < $num_docs);
    if ($pub_idx == 0) {
      return null;
    }
    return $publications;
  }
  
  public function getPublicationUrl($baseUrl) {
    if ($baseUrl == null || $baseUrl == '') { return null; }
    $result = $baseUrl;
    if (stripos($result, self::ISSUU_MAIN_URL) === false) {
      if (stripos($result, '/') !== 0) {
        $result = '/' . $result;
      }
      $result = self::ISSUU_MAIN_URL . $result;
    }
    return $result;
  }
  
  public function getPublicationId($publicationUrl) {
    if ($publicationUrl == null || $publicationUrl == '') { return null; }
    $doc_id = null;
    $pub_html = @$this->downloadFile($publicationUrl);
    $dom = new DOMDocument();
    try {
      @$dom->loadHTML($pub_html);
    } catch (Exception $e) { }
    $xpath = new DOMXPath($dom);
    $issuu_reader_url = '';
    $entries = @$xpath->query("//meta[@property='og:video']/@content[1]");
    foreach ($entries as $entry) {
      $issuu_reader_url = @$entry->nodeValue;
      break;
    }
    $qparts = @$this->getUrlQuery($issuu_reader_url);
    $doc_id = @$qparts['documentId'];
    return $doc_id;
  }
  
  public function getPublicationProperties($publicationId) {
    if ($publicationId == null || $publicationId == '') { return null; }
    $doc_properties_url = sprintf(self::ISSUU_SEARCH_DOC_URL, $publicationId);
    try {
      $doc_properties = 
        @json_decode($this->downloadFile($doc_properties_url),true);
    } catch (Exception $e) { $doc_properties = null; }
    return $doc_properties;
  }  
  
  public function createDocumentInfo($publicationProperties) {
    if ($publicationProperties == null) { return null; }
    $numdocs = @$publicationProperties['response']['numFound'];
    if ($numdocs == 0) { return null; }
    $doc_info['pagecount'] = @$publicationProperties['response']['docs'][0]['pagecount'];
    if ($doc_info['pagecount'] == 0) { return null; }
    $doc_info['subject'  ] = @$publicationProperties['response']['docs'][0]['description'];
    $doc_info['author'   ] = @$publicationProperties['response']['docs'][0]['username'];
    $doc_info['title'    ] = @$publicationProperties['response']['docs'][0]['title'];
    $doc_info['docname'  ] = @$publicationProperties['response']['docs'][0]['docname'];
    $doc_info['docid'    ] = @$publicationProperties['response']['docs'][0]['documentId'];
    $doc_info['keywords' ] = '';
    $tags = @$publicationProperties['response']['docs'][0]['tag'];
    foreach ($tags as $tag) { 
      $doc_info['keywords'] .= $tag . ' ';
    }
    if ($doc_info['title']) {
      $doc_info['filename'] = $doc_info['title'];
    } else if ($doc_info['docname']) {
      $doc_info['filename'] = $doc_info['docname'];
    } else if ($doc_info['subject']) {
      $doc_info['filename'] = $doc_info['subject']; 
    } else {
      $doc_info['filename'] = $doc_info['docid'];
    }
    $doc_info['filename'] = @$this->getPdfFilename($doc_info['filename']);
    $doc_info['creator'] = self::PDF_CREATOR_APPNAME;
    return $doc_info;
  }

  public function createPdf($documentInfo) {
    $result = true;
    $final_pdf_filename = sprintf('%s/%s.%s', 
                                  self::TEMP_DIR, 
                                  str_replace("-", "", $documentInfo['docid']), 
                                  self::ISSUU_OUTPUT_DOCUMENT_TYPE);
    if (is_file($final_pdf_filename)){
       @touch($final_pdf_filename);
       return $final_pdf_filename;
    }
    $images_pages = null;
    // PDF Temp Filename Format:
    // <ISSUU_TMP_FILE_PREFIX>_<pubid>_<fileid>.<ISSUU_OUTPUT_DOCUMENT_TYPE>
    $fname = sprintf('%s_%s_',
    		self::ISSUU_TMP_FILE_PREFIX,
    		$documentInfo['docid']);
    $tmp_pdf = @tempnam(self::TEMP_DIR, $fname);
    $fname = sprintf('%s.%s', $tmp_pdf, self::ISSUU_OUTPUT_DOCUMENT_TYPE);
    @rename($tmp_pdf, $fname);
    $tmp_pdf = $fname;

    $pdf = @$this->initPdf($documentInfo, $tmp_pdf);
    if ($pdf == null) {
      $result = false;
    }
    if ($result) {
      $images_pages = @$this->buildPdf($pdf, $documentInfo);
      if ($images_pages == null) {
        $result = false;
      }
    }
    if ($result) {
      try {
        @$pdf->Output();
      } catch (Exception $e) {
        $result = false;
      }
    }
    if ($images_pages != null) {
      $this->deleteTmpImages($images_pages);
    }
    $this->last_images = $images_pages;
    if (!$result) {
      @unlink($tmp_pdf);
      return null;
    }
    @rename($tmp_pdf, $final_pdf_filename);
    $tmp_pdf = $final_pdf_filename;
    return $tmp_pdf;
  }

  public function deletePdf($pdfFilename) {
    @unlink($pdfFilename);
  }
  
  public function copyPdfTo($documentInfo, $pdfFilename, $destDir) {
    $result = true;
    $dst = @$this->getPdfFilename($documentInfo['filename']);
    if (strripos($destDir, '/') === (strlen($destDir) - 1)) {
      $dst = $destDir . $dst;
    } else {
      $dst = $destDir . '/' . $dst;
    }
    set_time_limit(0);
    $src_file = @fopen($pdfFilename,"rb");
    $dst_file = @fopen($dst,"wb");
    while(!feof($src_file)) {
      $buf = @fread($src_file, self::FILE_READ_CHUNK_SIZE);
      $written = @fwrite($dst_file, $buf);
      if (strlen($buf) !== $written) {
        $result = false;
        break;
      }
    }
    @fclose($src_file); @fclose($dst_file);
    if (!$result) { @unlink($dst); }
    set_time_limit(self::PHP_TIME_LIMIT);
    return $result;
  }
  
  private function initPdf($doc_info, $tmp_pdf) {
    try {
      $pdf = new FPDF2File('P','pt');
      $pdf->Open       ($tmp_pdf);
      $pdf->SetTitle   ($doc_info['title'   ], true);
      $pdf->SetSubject ($doc_info['subject' ], true);
      $pdf->SetCreator ($doc_info['creator' ], true);
      $pdf->SetAuthor  ($doc_info['author'  ], true);
      $pdf->SetKeywords($doc_info['keywords'], true);
      return $pdf;
    } catch (Exception $e) { 
        return null;
    }
  }

  private function buildPdf($pdf, $doc_info) {
    $requests = array();
    $page_number = 1;
    $images_pages = array();
    $image_idx = 0;
    set_time_limit(self::PHP_TIME_LIMIT);
    while ($page_number <= $doc_info['pagecount']) {
      unset($requests);
      for ($page_index = 0; $page_index < self::CURL_CONNECTIONS_LIMIT; $page_index++) {
        $requests[$page_index] = 
          @$this->getPageUrl($doc_info['docid'], $page_number);
        $page_number++;
        if ($page_number > $doc_info['pagecount']) break;
      }
      set_time_limit(0);
      unset($responses);
      $responses = @$this->downloadMultiFiles($requests);
      set_time_limit(self::PHP_TIME_LIMIT);
      for ($page_index = 0; $page_index < count($responses); $page_index++) {
        $tmpfname = 
          @$this->saveImageToTmpFile($responses[$page_index], $doc_info, $image_idx);
        $retry_download = 1;
        try {
          if (connection_aborted()) {
            $this->deleteTmpImages($images_pages);
            return null;
          }
          while (!$this->addPageToPdf($pdf, $tmpfname)) {
            try {
              if ($tmpfname != null) { @unlink($tmpfname); }
            } catch (Exception $e1) { }
          	if ($retry_download > self::CURL_MAX_RETRY) {
              $this->deleteTmpImages($images_pages);
              return null;
            }
            $data = @$this->downloadFile($requests[$page_index]);
            $tmpfname = @$this->saveImageToTmpFile($data, $doc_info, $image_idx);
            $retry_download++;
          }
        } catch (Exception $e) { 
          $this->deleteTmpImages($images_pages);
          return null;
        }
        $images_pages[$image_idx] = $tmpfname;
        $this->last_images = $images_pages;
        $image_idx++;
      }
    }
    if ($pdf->PageNo() != $doc_info['pagecount']) { 
      $this->deleteTmpImages($images_pages);
      return null;
    }
    return $images_pages;
  }

  private function addPageToPdf($pdf, $page_fname) {
    $result = false;
    if ($page_fname == null) { return false; }
    try {
        $img_size = @$this->getjpgsize($page_fname);
        if ($img_size != FALSE && $img_size[0] > 0 && $img_size[1] > 0) {
          $w = $img_size[0]; $h = $img_size[1];
          if ($w < $h) { $orient = 'P'; } else { $orient = 'L'; }
          $pdf->AddPage($orient, $img_size);
        } else {
          $pdf->AddPage();
        }
        @$pdf->Image($page_fname, 0, 0, -self::FPDF_IMAGE_DPI);
      $result = true;
    } catch (Exception $e) {
      $result = false;
    }
    return $result;
  }

  private function saveImageToTmpFile($data, $doc_info, $index) {
    if ($data == null) { return null; }
    try {
      // IMG Temp Filename Format: 
      // <ISSUU_TMP_FILE_PREFIX>_<pubid>_<pageidx>_<fileid>.<ISSUU_IMAGE_TYPE>
      $fname = sprintf('%s_%s_%05d_',
                       self::ISSUU_TMP_FILE_PREFIX,
                       $doc_info['docid'], ($index + 1));
      $tmpfname = @tempnam(self::TEMP_DIR, $fname);
      $fname = sprintf('%s.%s', $tmpfname, self::ISSUU_IMAGE_TYPE);
      @rename($tmpfname, $fname);
      $temp = @fopen($fname, "w");
      @fwrite($temp, $data);
      @fclose($temp);
      return $fname;
    } catch (Exception $e) {
      return null;
    }
  }

  private function deleteTmpImages($images_pages) {
    foreach ($images_pages as $tmp_img) {
      @unlink($tmp_img);
    }
  }

  private function getPdfFilename($doc_desc) {
    $pub_filename = @substr($doc_desc,0,100);
    $pub_filename =
      trim(@strtr($pub_filename,
                  " /\\:?*&%$#@|\"'.\n\r\t+","___________________")) .
        '.' . self::ISSUU_OUTPUT_DOCUMENT_TYPE;
    return $pub_filename;
  }
  
  private function getPageUrl($doc_id, $page_number) {
    $page_url = 
      sprintf(self::ISSUU_IMAGE_URL, $doc_id, 
              $page_number, self::ISSUU_IMAGE_TYPE);
    return $page_url;
  }
  
  private function getUrlQuery($url) {
    try {
      $urlParts = @parse_url($url);
      $queryParts = @explode('&', $urlParts['query']);
      $params = array();
      foreach ($queryParts as $param) {
        $item = @explode('=', $param);
        $params[$item[0]] = $item[1];
      }
      return $params;
    } catch (Exception $e) {
      return null;
    }
  }

  private function getjpgsize($file) {
    $handle = @fopen($file, "rb");
    $new_block = NULL;
    if (!feof($handle)) {
      $new_block = @fread($handle, 32);
      $i = 0;
      if ($new_block[$i    ] == "\xFF" && $new_block[$i + 1] == "\xD8" && 
          $new_block[$i + 2] == "\xFF" && $new_block[$i + 3] == "\xE0") {
        $i += 4;
        if ($new_block[$i + 2] == "\x4A" && $new_block[$i + 3] == "\x46" &&
            $new_block[$i + 4] == "\x49" && $new_block[$i + 5] == "\x46" && 
            $new_block[$i + 6] == "\x00") {
          $block_size = unpack("H*", $new_block[$i] . $new_block[$i + 1]);
          $block_size = hexdec($block_size[1]);
          while (!feof($handle)) {
            $i += $block_size;
            $new_block .= @fread($handle, $block_size);
            if ($new_block[$i] == "\xFF") {
              $sof_marker = 
                array("\xC0", "\xC1", "\xC2", "\xC3", "\xC5", "\xC6", "\xC7",
                      "\xC8", "\xC9", "\xCA", "\xCB", "\xCD", "\xCE", "\xCF");
              if (in_array($new_block[$i + 1], $sof_marker)) {
                $size_data = $new_block[$i + 2] . $new_block[$i + 3] . 
                             $new_block[$i + 4] . $new_block[$i + 5] . 
                             $new_block[$i + 6] . $new_block[$i + 7] . 
                             $new_block[$i + 8];
                $unpacked = unpack("H*", $size_data);
                $unpacked = $unpacked[1];
                $height = hexdec($unpacked[6] . $unpacked[7] . 
                                 $unpacked[8] . $unpacked[9]);
                $width = hexdec($unpacked[10] . $unpacked[11] . 
                                $unpacked[12] . $unpacked[13]);
                return array($width, $height);
              } else {
                $i += 2;
                $block_size = unpack("H*", $new_block[$i] . $new_block[$i + 1]);
                $block_size = hexdec($block_size[1]);
              }
            } else {
              return FALSE;
            }
          }
        }
      }
    }
    return FALSE;
  }  
  
  private function downloadFile($url) {
    try {
      $curlSession = curl_init();
      curl_setopt($curlSession, CURLOPT_URL, $url);
      curl_setopt($curlSession, CURLOPT_BINARYTRANSFER, 1);
      curl_setopt($curlSession, CURLOPT_RETURNTRANSFER, 1);
      curl_setopt($curlSession, CURLOPT_HEADER, 0);
      curl_setopt($curlSession, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
        if ($this->username != null && $this->username != '' &&
            $this->token    != null && $this->token    != '') {
          $cookie = sprintf(self::ISSUU_COOKIE, $this->username, $this->token);
          curl_setopt($curlSession, CURLOPT_COOKIE, $cookie);
        }
      $result = curl_exec($curlSession);
      curl_close($curlSession);
      return $result;
    } catch (Exception $e) {
      return null;
    }
  }
  
  private function downloadMultiFiles($data, $options = array()) {
    $curly = array();
    $result = array();
    try {
      $mh = curl_multi_init();
      foreach ($data as $id => $d) {
        $curly[$id] = curl_init();
        $url = (is_array($d) && !empty($d['url'])) ? $d['url'] : $d;
        curl_setopt($curly[$id], CURLOPT_URL,            $url);
        curl_setopt($curly[$id], CURLOPT_HEADER,         0);
        curl_setopt($curly[$id], CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($curly[$id], CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
        if ($this->username != null && $this->username != '' &&
            $this->token    != null && $this->token    != '') {
          $cookie = sprintf(self::ISSUU_COOKIE, $this->username, $this->token);
          curl_setopt($curly[$id], CURLOPT_COOKIE, $cookie);
        }
        if (!empty($options)) {
          curl_setopt_array($curly[$id], $options);
        }
        curl_multi_add_handle($mh, $curly[$id]);
      }
      $running = null;
      do {
        curl_multi_exec($mh, $running);
      } while($running > 0);
      foreach($curly as $id => $c) {
        $result[$id] = curl_multi_getcontent($c);
        curl_multi_remove_handle($mh, $c);
      }
      curl_multi_close($mh);
    } catch (Exception $e) {
      $result = null;
    }
    return $result;
  }  
  
}

?>