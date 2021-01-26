<?php
/* ---------------------------------------------------------------------------- 
 *  Visitor Info Service (v.1.5.1)
 * ---------------------------------------------------------------------------- 
 *  Copyright (C) 2021 Robson S. Martins
 *  Robson Martins <https://www.robsonmartins.com>
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
 *  GeoIp2 PHP API             <https://github.com/maxmind/GeoIP2-php>
 *  UAParser PHP Library       <https://github.com/yzalis/UAParser>
 *  Symfony Yaml Component     <http://symfony.com/components/Yaml>
 *  Doctrine Inflector Library <http://www.doctrine-project.org>
 * ---------------------------------------------------------------------------- 
 */
 
require_once("GeoIp2/Database/Reader.php");
require_once("UAParser/UAParser.php");

use GeoIp2\Database\Reader;
use UAParser\UAParser;

/* -------------------------------------------------------------------------- */ 

/**
 *  Used to determine the visitor associated properties using the
 *  HTTP_USER_AGENT value supplied by a user's web browser and the IP address of
 *  the user's remote machine.
 */
class VisitorInfo {
  
  /* URL for search details into IP-API free service */
  const IP_API_QUERY_URL   = 'http://ip-api.com/json/%s';
  /* URL for search city details into GeoBytes free service */
  const GD_QUERY_URL       = 'http://getcitydetails.geobytes.com/GetCityDetails?callback=?&fqcn=%s';
  /* Path of GeoIp2 Lite city database */
  const GEO_LITE_DB_PATH   = 'GeoLite2-City.mmdb';

  /**
   * Returns the IP address of the remote machine.
   */
  public function getIP() {
    $ip_server = $_SERVER['SERVER_ADDR'];
    $ip = $_SERVER['REMOTE_ADDR'];
    if (!$ip || !strcmp($ip, $ip_server)) 
      $ip = @$_SERVER["HTTP_X_FORWARDED_FOR"];
    if (strpos($ip,",") !== false) {
      $ips = explode(",",$ip);
      $ip = trim($ips[count($ips) - 1]);
    }
    if (!$ip && $ip_server){
      $ip = $ip_server;
    } else if (!$ip){
      $ip = '127.0.0.1';
    }
    return ($ip);
  }

  /**
   * Returns the User Agent string supplied by the user's web browser.
   */
  public function getUserAgentStr() {
    return (getenv('HTTP_USER_AGENT')); 
  }
  
  /**
   * Returns the geolocalization data of the user.
   * @param $ip IP address of the user's machine.
   * @return Associative array:
   *         country ==> Country name
   *         ccode   ==> Country code
   *         city    ==> City name
   *         lat     ==> Latitude
   *         long    ==> Longitude
   */
  public function getGeoInfo($ip) {
	$geoInfo = $this->getGeoInfoByIpApi($ip);
    if ($geoInfo == null) {
      $geoInfo = $this->getGeoInfoByGeoBytes($ip);
	}		
    if ($geoInfo == null) {
	  $geoInfo = $this->getGeoInfoByGeoIP2($ip);
	}
    return ($geoInfo);
  }

  /**
   * Returns the web browser and operating system information of the
   *   user's machine.
   * @param $uaString User Agent string supplied by the user's web browser.
   * @return Associative array:
   *         os              ==> Operating System name
   *         os_version      ==> Operating System version
   *         os_code         ==> Operating System code
   *         browser         ==> Web Browser name
   *         browser_version ==> Web Browser version
   *         browser_code    ==> Web Browser code
   *         is_mobile       ==> If machine is a mobile device
   */
  public function getUserAgentInfo($uaString) {
    $uaInfo  = $this->getUserAgentInfoByUAParser($uaString); 
    $uaInfo2 = $this->getUserAgentInfoByPhpSniff($uaString); 
    
    if ($uaInfo == null) { $uaInfo = $uaInfo2; }

    if (!strcmp(@$uaInfo ['os_code'],""))
      { $uaInfo ['os_code'] = "unknown"; }
    if (!strcmp(@$uaInfo2['os_code'],""))
      { $uaInfo2['os_code'] = "unknown"; }
    
    if (!strcmp(@$uaInfo ['browser_code'],""))
      { $uaInfo ['browser_code'] = "unknown"; }
    if (!strcmp(@$uaInfo2['browser_code'],""))
      { $uaInfo2['browser_code'] = "unknown"; }

    if (!strcmp(@$uaInfo['os_code'],'unknown')) {
      $uaInfo['os_code'] = @$uaInfo2['os_code'];
      $uaInfo['os'     ] = @$uaInfo2['os'     ];
    }
    if (!strcmp(@$uaInfo['browser_code'],'unknown')) {
      $uaInfo['browser_code'] = @$uaInfo2['browser_code'];
      $uaInfo['browser'     ] = @$uaInfo2['browser'     ];
    }
    if (!strcmp(@$uaInfo ['os_version'],"") && 
         strcmp(@$uaInfo2['os_version'],"")) {
        $uaInfo['os_version'] = @$uaInfo2['os_version'];
        $uaInfo['os'        ] = @$uaInfo2['os'        ];
        $uaInfo['os_code'   ] = @$uaInfo2['os_code'   ];
    }
    if (!strcmp(@$uaInfo ['browser_version'],"") && 
         strcmp(@$uaInfo2['browser_version'],"")) {
       $uaInfo['browser_version'] = @$uaInfo2['browser_version']; 
       $uaInfo['browser'        ] = @$uaInfo2['browser'        ]; 
       $uaInfo['browser_code'   ] = @$uaInfo2['browser_code'   ]; 
    }
    if (@$uaInfo['is_mobile'] != @$uaInfo2['is_mobile'])
      { $uaInfo['is_mobile']  = @$uaInfo2['is_mobile']; }
      
    if (@$uaInfo['os_version'] == 'XP' || 
        @$uaInfo['os_code'   ] == 'linux') { $uaInfo = $uaInfo2; }

    switch (@$uaInfo['os_code']){
      case "unknown"      : $uaInfo['os'     ] = "Unknown"     ; break;
      case "os/2"         : $uaInfo['os_code'] = "os2"         ; break;
      case "risc os"      : $uaInfo['os_code'] = "risc"        ; break;
      case "digital unix" :
      case "dec"          :
      case "vms"          :
      case "sco"          :
      case "unixware"     :
      case "mpras"        :
      case "reliant"      :
      case "sinix"        : $uaInfo['os_code'] = "unix"        ; break;
      case "macos"        :
      case "mac os"       : 
      case "darwin"       : 
      case "macppc"       : $uaInfo['os_code'] = "macosx"      ;
                            $uaInfo['os'     ] = "Mac OS X"    ; break;
      case "bsd"          : $uaInfo['os'     ] = "BSD Unix"    ; break;
      case "ios"          : $uaInfo['os_code'] = "iphone"      ;
                            $uaInfo['is_mobile'] = true        ; break;
      case "windows phone os": 
      case "windowsphone"    :
      case "winphone"        :
      case "windows phone"   : $uaInfo['os_code'  ] = "winphoneos";
                               $uaInfo['is_mobile'] = true        ; break;
      case "symbian"         : $uaInfo['os_code'  ] = "symbianos" ;
                               $uaInfo['is_mobile'] = true        ; break;
      case "blackberry os"   : $uaInfo['os_code'  ] = "blackberry";
                               $uaInfo['is_mobile'] = true        ; break;
      case "wap"          : 
      case "palm"         : 
      case "palmos"       : 
      case "midp"         : 
      case "pda"          : 
      case "jme"          : 
      case "java"         : 
      case "blackberry"   : 
      case "android"      : 
      case "iphone"       : 
      case "symbianos"    : 
      case "webos"        : 
      case "winphoneos"   : $uaInfo['is_mobile'] = true        ; break;
      case "winme"        : $uaInfo['os'     ] = "Windows"     ; 
                            $uaInfo['os_version'] = "ME"       ; break;
      case "winxp"        : $uaInfo['os'     ] = "Windows"     ; 
                            $uaInfo['os_version'] = "XP"       ; break;
      case "winvista"     : $uaInfo['os'     ] = "Windows"     ; 
                            $uaInfo['os_version'] = "Vista"    ; break;
      case "win81"        : $uaInfo['os'     ] = "Windows"     ; 
                            $uaInfo['os_version'] = "8.1"      ; break;
      case "win"          :
      case "win32"        : $uaInfo['os'     ] = "Windows"     ; break;
      case "win16"        :
      case "win31"        : $uaInfo['os'     ] = "Windows"     ; break;
                            $uaInfo['os_version'] = "3.x"      ; break;
      case "winnt"        : $uaInfo['os'     ] = "Windows"     ; break;
                            $uaInfo['os_version'] = "NT"       ; break;
      case "windows"      : 
        $ver = floatval(@$uaInfo['os_version']);
        if ($ver > 0) { $uaInfo['os_version'] = $ver; }
        $uaInfo['os_code'   ] = 
          strtolower(str_replace(".","","win".@$uaInfo['os_version']));
        break;
      default:
        if (substr(@$uaInfo['os_code'],0,3) === "win") {
          $uaInfo['os'        ] = "Windows"; 
          $ver = floatval(substr(@$uaInfo['os_code'],3));
          if ($ver > 0) { 
            $uaInfo['os_version'] = $ver;
          } else {
            $uaInfo['os_version'] = substr(@$uaInfo['os_code'],3); 
          }
          $uaInfo['os_code'   ] = 
            str_replace(".","",'win'.@$uaInfo['os_version']); 
        }
    }
    /* Win10 Edge Browser */
    if (@$uaInfo['os_code'] === 'win10' &&
        @$uaInfo2['browser_code'] === 'edge' && @$uaInfo['browser_version'] > 11){

        $uaInfo['browser_code'   ] = @$uaInfo2['browser_code'   ];
        $uaInfo['browser'        ] = @$uaInfo2['browser'        ];
        $uaInfo['browser_version'] = @$uaInfo2['browser_version'];
    }
    
    switch (@$uaInfo['browser_code']){
      case "unknown"          : $uaInfo['browser'     ] = "Unknown"          ; break;
      case "edge"             : $uaInfo['browser'     ] = "Edge"             ; break;
      case "internet explorer": $uaInfo['browser_code'] = "ie"; 
      case "ie"               : $uaInfo['browser'     ] = "Internet Explorer"; break;
      case "palemoon"         : $uaInfo['browser_code'] = "firefox"          ; break;
      case "multizilla"       : $uaInfo['browser_code'] = "mozilla"          ; break;
      case "firefox mobile"   : $uaInfo['browser_code'] = "fennec"           ; break;
      case "webtv/msntv"      : $uaInfo['browser_code'] = "webtv"            ; break;
      case "avant browser"    : $uaInfo['browser_code'] = "avant"            ; break;
      default:
        if (strpos(@$uaInfo['browser_code'],"google") !== false) { 
          $uaInfo['browser_code'] = "google"; 
          $uaInfo['os_code'     ] = "google"; 
          $uaInfo['os'          ] = @$uaInfo['browser']; 
        } else if (strpos(@$uaInfo['browser_code'],"inktomi") !== false) { 
          $uaInfo['browser_code'] = "yahoo"; 
          $uaInfo['os_code'     ] = "yahoo";
          $uaInfo['os'          ] = @$uaInfo['browser']; 
        } else if (strpos(@$uaInfo['browser_code'],"yahoo") !== false) { 
          $uaInfo['browser_code'] = "yahoo"; 
          $uaInfo['os_code'     ] = "yahoo"; 
          $uaInfo['os'          ] = @$uaInfo['browser']; 
        }
    }
    if (!strcmp(@$uaInfo['browser_version'],"0")){ 
      $uaInfo['browser_version'] = ""; 
    }
    $uaInfo['os_is64bit'] = $this->is64bit($uaString);
    return ($uaInfo);
  }

  private function getGeoInfoByIpApi($ip) {
    $geoInfo = null; $record = null;
    try {
      $query_url = sprintf(self::IP_API_QUERY_URL, $ip);
      $record = @json_decode(
                    @file_get_contents($query_url), true);
    } catch (Exception $e) { $record = null; }
    if ($record != null) {
      $geoInfo = array();
      $geoInfo['country'] = trim(@$record['country'    ]);
      $geoInfo['ccode'  ] = trim(@$record['countryCode']);
      $geoInfo['city'   ] = trim(@$record['city'       ]);
      $geoInfo['lat'    ] = trim(@$record['lat'        ]);
      $geoInfo['long'   ] = trim(@$record['lon'        ]);
    }
    return ($geoInfo);
  }

  private function getGeoInfoByGeoBytes($ip) {
    $geoInfo = null; $record = null;
    try {
      $query_url = sprintf(self::GD_QUERY_URL, $ip);
      $record = @json_decode(
                    @utf8_encode(@file_get_contents($query_url)), true);
    } catch (Exception $e) { $record = null; }
    if ($record != null) {
      $geoInfo = array();
      $geoInfo['country'] = trim(@$record['geobytescountry'  ]);
      $geoInfo['ccode'  ] = trim(@$record['geobytesinternet' ]);
      $geoInfo['city'   ] = trim(@$record['geobytescity'     ]);
      $geoInfo['lat'    ] = trim(@$record['geobyteslatitude' ]);
      $geoInfo['long'   ] = trim(@$record['geobyteslongitude']);
    }
    return ($geoInfo);
  }

  private function getGeoInfoByGeoIP2($ip) {
    $geoInfo = null; $record = null;
    try {
      $reader  = new Reader(self::GEO_LITE_DB_PATH);
      $record  = $reader->city($ip);
    } catch (Exception $e) { $record = null; }
    if ($record != null) {
      $geoInfo = array();
      $geoInfo['country'  ] = trim($record->country->name          );
      $geoInfo['ccode'    ] = trim($record->country->isoCode       );
      $geoInfo['city'     ] = trim($record->city->name             );
      $geoInfo['lat'      ] = trim($record->location->latitude     );
      $geoInfo['long'     ] = trim($record->location->longitude    );
    }
    return ($geoInfo);
  }

  private function getUserAgentInfoByUAParser($uaString) {
    $uaInfo = null; $record = null;
    try {
      $uaParser = new UAParser();
      $record =  $uaParser->parse($uaString);
    } catch (Exception $e) { $record = null; }
    if ($record != null) {
      $uaInfo = array();
      $os = $record->getOperatingSystem()->getFamily();
      if ($os == null || !strcasecmp($os,"other") ||
          !strcasecmp($os,"null")) { $os = ""; }
      $os_ver = $record->getOperatingSystem()->getMajor();
      if ($os_ver == null || !strcasecmp($os_ver,"other") ||
          !strcasecmp($os_ver,"null")) { $os_ver = ""; }
      if (strcmp($os_ver,'') &&
          strcmp($record->getOperatingSystem()->getMinor(),'')) {
        $os_ver = $os_ver . '.' . $record->getOperatingSystem()->getMinor();
      }
      if (strcmp($os_ver,'') &&
          strcmp($record->getOperatingSystem()->getPatch(),'')) {
        $os_ver = $os_ver . '.' . $record->getOperatingSystem()->getPatch();
      }
      $oscode = strtolower($os);
      $browser = $record->getBrowser()->getFamily();
      if ($browser == null || !strcasecmp($browser,"other") ||
          !strcasecmp($browser,"null")) { $browser = ""; }
      $brws_ver = $record->getBrowser()->getMajor();
      if ($brws_ver == null || !strcasecmp($brws_ver,"other") ||
          !strcasecmp($brws_ver,"null")) { $brws_ver = ""; }
      if (strcmp($brws_ver,'') && strcmp($record->getBrowser()->getMinor(),'')) {
        $brws_ver = $brws_ver . '.' . $record->getBrowser()->getMinor();
      }
      if (strcmp($brws_ver,'') && strcmp($record->getBrowser()->getPatch(),'')) {
        $brws_ver = $brws_ver . '.' . $record->getBrowser()->getPatch();
      }
      $brwscode = strtolower($browser);
      $ismobiledevice = $record->getDevice()->isMobile() || 
                        $record->getDevice()->isTablet() ||
                        !($record->getDevice()->isDesktop());
      $uaInfo['os'             ] = $os;
      $uaInfo['os_version'     ] = $os_ver;
      $uaInfo['os_code'        ] = $oscode;
      $uaInfo['browser'        ] = $browser;
      $uaInfo['browser_version'] = $brws_ver;
      $uaInfo['browser_code'   ] = $brwscode;
      $uaInfo['is_mobile'      ] = $ismobiledevice;
    }
    return ($uaInfo);
  }

  private function getUserAgentInfoByPhpSniff($uaString) {
    $uaInfo = null; $record = null;
    try {
      $record = $this->phpSniff($uaString);
    } catch (Exception $e) { $record = null; }
    if ($record != null) {
      $uaInfo = array();
      $uaInfo['os'             ] = @$record['platform'];
      $uaInfo['os_code'        ] = strtolower(@$record['platform']);
      $uaInfo['os_version'     ] = '';
      $uaInfo['browser'        ] = @$record['browser'];
      $uaInfo['browser_version'] = @$record['version'];
      $uaInfo['browser_code'   ] = strtolower(@$record['browser']);
      $uaInfo['is_mobile'      ] = @$record['ismobiledevice'];
    }
    return ($uaInfo);
  }

  /*  ------------------------------------------------------------------------- 
   *  phpSniff: get os info based in user agent string
   *  ------------------------------------------------------------------------- 
   *  PHP Client Sniffer (phpsniff)
   *
   *  This library is free software; you can redistribute it and/or
   *  modify it under the terms of the GNU Lesser General Public
   *  License as published by the Free Software Foundation; either
   *  version 2.1 of the License, or (at your option) any later version.
   *  
   *  This library is distributed in the hope that it will be useful,
   *  but WITHOUT ANY WARRANTY; without even the implied warranty of
   *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
   *  Lesser General Public License for more details.
   *  
   *  You should have received a copy of the GNU Lesser General Public
   *  License along with this library; if not, write to the Free Software
   *  Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
   *
   *  @author Roger Raymond <epsilon7@users.sourceforge.net>
   *  @version $Id: phpSniff.class.php,v 1.22 2004/04/27 00:55:49 epsilon7 Exp $
   *  @copyright Copyright &copy; 2002-2004 Roger Raymond
   *  @package phpSniff
   *  @license http://opensource.org/licenses/lgpl-license.php
   *    GNU Lesser General Public License
   *  @filesource
   */
  private function phpSniff($agent){
    $brws_info = array();
    $os = 'Unknown'; $browser = 'Unknown'; $version = '0';
    $ismobiledevice = false;
    // regexes to use
    $regex_windows  = '/([^dar]win[dows]*)[\s]?([0-9a-z]*)[\w\s]?([a-z0-9.]*)/i';
    $regex_mac      = '/(68[k0]{1,3})|(ppc mac os x)|([p\S]{1,5}pc)|(darwin)|(intel mac os x)|(mac os x)/i';
    $regex_os2      = '/os\/2|ibm-webexplorer/i';
    $regex_sunos    = '/(sun|i86)[os\s]*([0-9]*)/i';
    $regex_irix     = '/(irix)[\s]*([0-9]*)/i';
    $regex_hpux     = '/(hp-ux)[\s]*([0-9]*)/i';
    $regex_aix      = '/aix([0-9]*)/i';
    $regex_dec      = '/dec|osfl|alphaserver|ultrix|alphastation/i';
    $regex_vms      = '/vax|openvms/i';
    $regex_sco      = '/sco|unix_sv/i';
    $regex_linux    = '/x11|inux/i';
    $regex_bsd      = '/(free|open|net)?(bsd)|(dragonfly)/i';
    $regex_amiga    = '/amiga[os]?/i';
    // look for Windows Box
    if (preg_match_all($regex_windows,$agent,$match)){
      // Windows has some of the most ridiculous HTTP_USER_AGENT strings
      $v  = @$match[2][1];
      $v2 = @$match[3][1];
      if (empty($v) || empty($v2)) {     
        $v  = $match[2][0];
        $v2 = $match[3][0];
      }
      // more recent Windows 
      if (stristr($v,'NT') && $v2 > 10.0) $v = 'Win'.$v2;
      // Establish NT 10.0 as Windows 10
      elseif (stristr($v,'NT') && $v2 == 10.0) $v = 'Win10';
      // Establish NT 6.4 as Windows 10
      elseif (stristr($v,'NT') && $v2 == 6.4) $v = 'Win10';
      // Establish NT 6.3 as Windows 8.1
      elseif (stristr($v,'NT') && $v2 == 6.3) $v = 'Win81';
      // Establish NT 6.2 as Windows 8
      elseif (stristr($v,'NT') && $v2 == 6.2) $v = 'Win8';
      // Establish NT 6.1 as Windows 7
      elseif (stristr($v,'NT') && $v2 == 6.1) $v = 'Win7';
      // Establish NT 6.0 as Windows Vista
      elseif (stristr($v,'NT') && $v2 == 6.0) $v = 'WinVista';
      // Establish NT 5.2 as Windows 2003
      elseif (stristr($v,'NT') && $v2 == 5.2) $v = 'Win2003';
      // Establish NT 5.1 as Windows XP
      elseif (stristr($v,'NT') && $v2 == 5.1) $v = 'WinXP';
      // Establish NT 5.0 as win2000
      elseif (stristr($v,'NT') && $v2 == 5.0) $v = 'Win2000';
      // Establish 9x 4.90 as Windows 98
      elseif (stristr($v,'9x') && $v2 == 4.9) $v = 'Win98';
      // See if we're running windows 3.1
      elseif ($v.$v2 == '16bit') $v = 'Win31';
      // old Windows NT
      elseif (stristr($v,'NT') && $v2 < 5.0) $v = 'WinNT';
      // win CE
      elseif (stristr($v,'CE')) $v = 'WinCE';
      // otherwise display as is (31,95,98,NT,ME,XP)
      else $v = 'Win'.$v.$v2;
      // update browser info container array
      if (empty($v)) $v = 'Win';
      $os = $v;
    }
    //  look for amiga OS
    elseif (preg_match($regex_amiga,$agent,$match)){ $os = 'Amiga'; }
    // look for OS2
    elseif (preg_match($regex_os2,$agent)){ $os = 'OS/2'; }
    // look for beos
    elseif (stristr($agent,'beos')){ $os = 'BeOS'; }
    elseif (stristr($agent,'haiku')){ $os = 'Haiku'; }
    //  look for *nix boxes
    //  sunos sets: platform = *nix ; os = sun|sun4|sun5|suni86
    elseif (preg_match($regex_sunos,$agent,$match)){ $os = 'SunOS';}
    //  irix sets: platform = *nix ; os = irix|irix5|irix6|...
    elseif (preg_match($regex_irix,$agent,$match)){ $os = 'Irix'; }
    //  hp-ux sets: platform = *nix ; os = hpux9|hpux10|...
    elseif (preg_match($regex_hpux,$agent,$match)){ $os = 'HP-UX'; }
    //  aix sets: platform = *nix ; os = aix|aix1|aix2|aix3|...
    elseif (preg_match($regex_aix,$agent,$match)){ $os = 'AIX'; }
    //  dec sets: platform = *nix ; os = dec
    elseif (preg_match($regex_dec,$agent,$match)){ $os = 'DEC'; }
    //  vms sets: platform = *nix ; os = vms
    elseif (preg_match($regex_vms,$agent,$match)){ $os = 'VMS'; }
    //  sco sets: platform = *nix ; os = sco
    elseif (preg_match($regex_sco,$agent,$match)){ $os = 'SCO'; }
    //  unixware sets: platform = *nix ; os = unixware
    elseif (stristr($agent,'unix_system_v')){ $os = 'UnixWare'; }
    //  mpras sets: platform = *nix ; os = mpras
    elseif (stristr($agent,'ncr')){ $os = 'MPRAS'; }
    //  reliant sets: platform = *nix ; os = reliant
    elseif (stristr($agent,'reliantunix')){ $os = 'Reliant'; }
    //  sinix sets: platform = *nix ; os = sinix
    elseif (stristr($agent,'sinix')){ $os = 'Sinix'; }
    //  bsd sets: platform = *nix ; os = bsd|freebsd
    elseif (preg_match($regex_bsd,$agent,$match)){
      $os = $match[1].$match[2];
      if (empty($os)) $os = 'bsd';
    }
    // look for mac
    // sets: platform = mac ; os = 68k or ppc
    elseif (preg_match($regex_mac,$agent,$match)){
      $os = 'Mac';
      if (stristr($agent,'ppc')){ $os .= 'PPC'; }
      else $os .= 'OSX';
    }
    //  linux sets: platform = *nix ; os = linux
    elseif (preg_match($regex_linux,$agent,$match)){ $os = 'Linux'; }
    // Mobile
    if (stristr($agent,'palmos'))
      { $ismobiledevice = true; $os = 'PalmOS'; }
    elseif (stristr($agent,'midp') || stristr($agent,'wap'))
      { $ismobiledevice = true; $os = 'PDA'; }
    elseif (stristr($agent,'j2me'))
      { $ismobiledevice = true; $os = 'Java'; }
    elseif (stristr($agent,'android'))
      { $ismobiledevice = true; $os = 'Android'; }
    elseif (stristr($agent,'iphone'))
      { $ismobiledevice = true; $os = 'iPhone'; }
    elseif (stristr($agent,'symbian'))
      { $ismobiledevice = true; $os = 'SymbianOS'; }
    elseif (stristr($agent,'webos'))
      { $ismobiledevice = true; $os = 'WebOS'; }
    elseif (stristr($agent,'windows phone os'))
      { $ismobiledevice = true; $os = 'WinPhoneOS'; }
    /*--------------------------------------------------------------------------*/
    /* browser */
    $_browsers = array(
      'edge'                        => 'ME', /* Microsoft Edge */
      'internet explorer'           => 'IE',
      'msie'                        => 'IE',
      'netscape6'                   => 'NS',
      'netscape'                    => 'NS',
      'galeon'                      => 'GA',
      'phoenix'                     => 'PX',
      'mozilla firebird'            => 'FB',
      'firebird'                    => 'FB',
      'firefox'                     => 'FX',
      'chimera'                     => 'CH',
      'camino'                      => 'CA',
      'epiphany'                    => 'EP',
      'safari'                      => 'SF',
      'chrome'                      => 'CR',
      'k-meleon'                    => 'KM',
      'seamonkey'                   => 'SM',
      'mozilla'                     => 'MZ',
      'opera'                       => 'OP',
      'konqueror'                   => 'KQ',
      'icab'                        => 'IC',
      'lynx'                        => 'LX',
      'links'                       => 'LI',					
      'ncsa mosaic'                 => 'MO',
      'amaya'                       => 'AM',
      'omniweb'                     => 'OW',
      'hotjava'                     => 'HJ',
      'browsex'                     => 'BX',
      'amigavoyager'                => 'AV',
      'amiga-aweb'                  => 'AW',
      'ibrowse'                     => 'IB',
      'avant browser'               => 'AV',
      'multizilla'                  => 'MZ',
      'minefield'                   => 'FF',
      'w3m'                         => 'W3',
      'arora'                       => 'AR',
      'dillo'                       => 'DL',
      'netpositive'                 => 'NP',
      'webpositive'                 => 'WP',
      'eudoraweb'                   => 'EW',
      'fennec'                      => 'FN',
      'minimo'                      => 'MN',
      'netfront'                    => 'NF',
      'polaris'                     => 'PL',
      'blackberry'                  => 'BB'
    );
    $browsers = '';
    while (list($k,) = each($_browsers)){
      if (!empty($browsers)) $browsers .= "|";
      $browsers .= $k;
    }
    $version_string = "[\/\sa-z(]*([0-9]+)([\.0-9a-z]+)?";
    $_browser_regex = "/($browsers)$version_string/i";
    if (preg_match_all($_browser_regex,$agent,$results)){
      // get the position of the last browser found
      $count = count($results[0])-1;
      // if we're allowing masquerading, revert to the next to last browser found
      // if possible, otherwise stay put
      if (stristr($agent,"chrome")) $count--;
      if (stristr($agent,"edge")) $count++;
      if (stristr($agent,"webpositive")) $count--;
      //if ($count > 0) $count--;
      // insert findings into the container
      $browser = $results[1][$count];
      $version = $results[2][$count];
      // parse the minor version string and look for alpha chars
      preg_match('/([.\0-9]+)?([\.a-z0-9]+)?/i',$results[3][$count],$match);
      if (isset($match[1])){ $version .= $match[1]; } else { $version .= '.0'; }
    }
    if (!strcmp(strtolower($browser),'mozilla')){
      if (preg_match('/gecko(\/([0-9]+))?/i',$agent,$match)){
        if (preg_match('/rv[: ]?([0-9a-z.+]+)/i',$agent,$mozv)){   
          // mozilla release
          $version = $mozv[1];
        }
        elseif (preg_match('/(m[0-9]+)/i',$agent,$mozv)){   
          // mozilla milestone version
          $version = $mozv[1];
        }
      }
      else {
        // this is probably a netscape browser or compatible
        $browser = 'Netscape';
      }
    }
    switch (strtolower($browser)){
      case 'edge'             : $browser = 'edge'    ; break;
      case 'internet explorer':
      case 'msie'             : $browser = 'ie'      ; break;
      case 'minefield'        : $browser = 'Firefox' ; break;
      case 'mozilla firebird' : $browser = 'Firebird'; break;
      case 'eudoraweb'        :
      case 'fennec'           :
      case 'minimo'           :
      case 'netfront'         :
      case 'polaris'          :
      case 'blackberry'       : $ismobiledevice = true; break;
      default                 : break;
    }  
    $brws_info['platform'      ] = $os;
    $brws_info['browser'       ] = $browser;
    $brws_info['version'       ] = $version;
    $brws_info['ismobiledevice'] = $ismobiledevice;
    
    return $brws_info;
  }
  
  private function is64bit($agent){
    $is64bit = false;
    if (stristr($agent,"x86_64" )) $is64bit = true;
    if (stristr($agent,"x86-64" )) $is64bit = true;
    if (stristr($agent,"win64"  )) $is64bit = true;
    if (stristr($agent,"x64;"   )) $is64bit = true;
    if (stristr($agent,"amd64"  )) $is64bit = true;
    if (stristr($agent,"wow64"  )) $is64bit = true;
    if (stristr($agent,"x64_64" )) $is64bit = true;
    if (stristr($agent,"ia64"   )) $is64bit = true;
    if (stristr($agent,"sparc64")) $is64bit = true;
    if (stristr($agent,"ppc64"  )) $is64bit = true;
    if (stristr($agent,"irix64" )) $is64bit = true;
    if (stristr($agent,"aarch64")) $is64bit = true;
    if (stristr($agent,"arm64"  )) $is64bit = true;
    return $is64bit;
  }

}

?>
