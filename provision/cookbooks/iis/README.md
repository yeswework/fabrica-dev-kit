iis Cookbook
============

[![Build Status](https://travis-ci.org/chef-cookbooks/iis.svg?branch=master)](https://travis-ci.org/chef-cookbooks/iis)
[![Cookbook Version](https://img.shields.io/cookbook/v/iis.svg)](https://supermarket.chef.io/cookbooks/iis)

Installs and configures Microsoft Internet Information Services (IIS) 7.0 and later

Contents
========

  * [Attributes](#attributes)
  * [Resource/Provider](#resourceprovider)
    * [iis_root](#iis_root) Allows for easy management of the IIS Root Machine settings
    * [iis_site](#iis_site) Allows for easy management of IIS virtual sites (ie vhosts).
    * [iis_config](#iis_config) Runs a config command on your IIS instance.
    * [iis_pool](#iis_pool) Creates an application pool in IIS.
    * [iis_app](#iis_app) Creates an application in IIS.
    * [iis_vdir](#iis_vdir) Allows easy management of IIS virtual directories (i.e. vdirs).
    * [iis_section](#iis_section) Allows for the locking/unlocking of application web.config sections.
    * [iis_module](#iis_module) Manages modules globally or on a per site basis.
  * [Usage](#usage)
    * [default](#default) Default recipe
    * [mod\_\*](#mod_) Recipes for installing individual IIS modules (extensions).
  * [Alternatives ](#alternatives)
  * [License and Author](#license-and-author)

Requirements
============

Platform
--------

* Windows Vista
* Windows 7
* Windows 8
* Windows Server 2008 (R1, R2)
* Windows Server 2012
* Windows Server 2012R2

Windows 2003R2 is *not* supported because it lacks Add/Remove Features.

Cookbooks
---------

* windows

Attributes
==========

* `node['iis']['home']` - IIS main home directory. default is `%WINDIR%\System32\inetsrv`
* `node['iis']['conf_dir']` - location where main IIS configs lives. default is `%WINDIR%\System32\inetsrv\config`
* `node['iis']['pubroot']` - . default is `%SYSTEMDRIVE%\inetpub`
* `node['iis']['docroot']` - IIS web site home directory. default is `%SYSTEMDRIVE%\inetpub\wwwroot`
* `node['iis']['log_dir']` - location of IIS logs. default is `%SYSTEMDRIVE%\inetpub\logs\LogFiles`
* `node['iis']['cache_dir']` - location of cached data. default is `%SYSTEMDRIVE%\inetpub\temp`

Resource/Provider
=================

iis_root
---------

Allows for easy management of the IIS Root Machine settings

### Actions
`default` = `:config`

- `:add` - only does addition operations will not delete anything to an Array object
- `:delete` - only does deletion operations will not add anything to an Array object
- `:config` - does both addition and deletion make sure your Array objects contain everything you want

### Attribute Parameters

- `default_documents_enabled` - Enables or disables default_documents for the root machine, Valid Values: true, false default: `true`
- `default_documents` - The items you want to set as the default document collection, only used during `:config`. Array of strings, default: `['Default.htm', 'Default.asp', 'index.htm', 'index.html', 'iisstart.htm', 'default.aspx']`
- `mime_maps` - The items you want to set as the mime-maps or mime-types collection, only used during `:config`. Array of strings, default:
```ruby
["fileExtension='.323',mimeType='text/h323'", "fileExtension='.3g2',mimeType='video/3gpp2'", "fileExtension='.3gp2',mimeType='video/3gpp2'", "fileExtension='.3gp',mimeType='video/3gpp'", "fileExtension='.3gpp',mimeType='video/3gpp'", "fileExtension='.aaf',mimeType='application/octet-stream'", "fileExtension='.aac',mimeType='audio/aac'", "fileExtension='.aca',mimeType='application/octet-stream'", "fileExtension='.accdb',mimeType='application/msaccess'", "fileExtension='.accde',mimeType='application/msaccess'", "fileExtension='.accdt',mimeType='application/msaccess'", "fileExtension='.acx',mimeType='application/internet-property-stream'", "fileExtension='.adt',mimeType='audio/vnd.dlna.adts'", "fileExtension='.adts',mimeType='audio/vnd.dlna.adts'", "fileExtension='.afm',mimeType='application/octet-stream'", "fileExtension='.ai',mimeType='application/postscript'", "fileExtension='.aif',mimeType='audio/x-aiff'", "fileExtension='.aifc',mimeType='audio/aiff'", "fileExtension='.aiff',mimeType='audio/aiff'", "fileExtension='.application',mimeType='application/x-ms-application'", "fileExtension='.art',mimeType='image/x-jg'", "fileExtension='.asd',mimeType='application/octet-stream'", "fileExtension='.asf',mimeType='video/x-ms-asf'", "fileExtension='.asi',mimeType='application/octet-stream'", "fileExtension='.asm',mimeType='text/plain'", "fileExtension='.asr',mimeType='video/x-ms-asf'", "fileExtension='.asx',mimeType='video/x-ms-asf'", "fileExtension='.atom',mimeType='application/atom+xml'", "fileExtension='.au',mimeType='audio/basic'", "fileExtension='.avi',mimeType='video/avi'", "fileExtension='.axs',mimeType='application/olescript'", "fileExtension='.bas',mimeType='text/plain'", "fileExtension='.bcpio',mimeType='application/x-bcpio'", "fileExtension='.bin',mimeType='application/octet-stream'", "fileExtension='.bmp',mimeType='image/bmp'", "fileExtension='.c',mimeType='text/plain'", "fileExtension='.cab',mimeType='application/vnd.ms-cab-compressed'", "fileExtension='.calx',mimeType='application/vnd.ms-office.calx'", "fileExtension='.cat',mimeType='application/vnd.ms-pki.seccat'", "fileExtension='.cdf',mimeType='application/x-cdf'", "fileExtension='.chm',mimeType='application/octet-stream'", "fileExtension='.class',mimeType='application/x-java-applet'", "fileExtension='.clp',mimeType='application/x-msclip'", "fileExtension='.cmx',mimeType='image/x-cmx'", "fileExtension='.cnf',mimeType='text/plain'", "fileExtension='.cod',mimeType='image/cis-cod'", "fileExtension='.cpio',mimeType='application/x-cpio'", "fileExtension='.cpp',mimeType='text/plain'", "fileExtension='.crd',mimeType='application/x-mscardfile'", "fileExtension='.crl',mimeType='application/pkix-crl'", "fileExtension='.crt',mimeType='application/x-x509-ca-cert'", "fileExtension='.csh',mimeType='application/x-csh'", "fileExtension='.css',mimeType='text/css'", "fileExtension='.csv',mimeType='application/octet-stream'", "fileExtension='.cur',mimeType='application/octet-stream'", "fileExtension='.dcr',mimeType='application/x-director'", "fileExtension='.deploy',mimeType='application/octet-stream'", "fileExtension='.der',mimeType='application/x-x509-ca-cert'", "fileExtension='.dib',mimeType='image/bmp'", "fileExtension='.dir',mimeType='application/x-director'", "fileExtension='.disco',mimeType='text/xml'", "fileExtension='.dll',mimeType='application/x-msdownload'", "fileExtension='.dll.config',mimeType='text/xml'", "fileExtension='.dlm',mimeType='text/dlm'", "fileExtension='.doc',mimeType='application/msword'", "fileExtension='.docm',mimeType='application/vnd.ms-word.document.macroEnabled.12'", "fileExtension='.docx',mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'", "fileExtension='.dot',mimeType='application/msword'", "fileExtension='.dotm',mimeType='application/vnd.ms-word.template.macroEnabled.12'", "fileExtension='.dotx',mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.template'", "fileExtension='.dsp',mimeType='application/octet-stream'", "fileExtension='.dtd',mimeType='text/xml'", "fileExtension='.dvi',mimeType='application/x-dvi'", "fileExtension='.dvr-ms',mimeType='video/x-ms-dvr'", "fileExtension='.dwf',mimeType='drawing/x-dwf'", "fileExtension='.dwp',mimeType='application/octet-stream'", "fileExtension='.dxr',mimeType='application/x-director'", "fileExtension='.eml',mimeType='message/rfc822'", "fileExtension='.emz',mimeType='application/octet-stream'", "fileExtension='.eot',mimeType='application/vnd.ms-fontobject'", "fileExtension='.eps',mimeType='application/postscript'", "fileExtension='.etx',mimeType='text/x-setext'", "fileExtension='.evy',mimeType='application/envoy'", "fileExtension='.exe',mimeType='application/octet-stream'", "fileExtension='.exe.config',mimeType='text/xml'", "fileExtension='.fdf',mimeType='application/vnd.fdf'", "fileExtension='.fif',mimeType='application/fractals'", "fileExtension='.fla',mimeType='application/octet-stream'", "fileExtension='.flr',mimeType='x-world/x-vrml'", "fileExtension='.flv',mimeType='video/x-flv'", "fileExtension='.gif',mimeType='image/gif'", "fileExtension='.gtar',mimeType='application/x-gtar'", "fileExtension='.gz',mimeType='application/x-gzip'", "fileExtension='.h',mimeType='text/plain'", "fileExtension='.hdf',mimeType='application/x-hdf'", "fileExtension='.hdml',mimeType='text/x-hdml'", "fileExtension='.hhc',mimeType='application/x-oleobject'", "fileExtension='.hhk',mimeType='application/octet-stream'", "fileExtension='.hhp',mimeType='application/octet-stream'", "fileExtension='.hlp',mimeType='application/winhlp'", "fileExtension='.hqx',mimeType='application/mac-binhex40'", "fileExtension='.hta',mimeType='application/hta'", "fileExtension='.htc',mimeType='text/x-component'", "fileExtension='.htm',mimeType='text/html'", "fileExtension='.html',mimeType='text/html'", "fileExtension='.htt',mimeType='text/webviewhtml'", "fileExtension='.hxt',mimeType='text/html'", "fileExtension='.ico',mimeType='image/x-icon'", "fileExtension='.ics',mimeType='text/calendar'", "fileExtension='.ief',mimeType='image/ief'", "fileExtension='.iii',mimeType='application/x-iphone'", "fileExtension='.inf',mimeType='application/octet-stream'", "fileExtension='.ins',mimeType='application/x-internet-signup'", "fileExtension='.isp',mimeType='application/x-internet-signup'", "fileExtension='.IVF',mimeType='video/x-ivf'", "fileExtension='.jar',mimeType='application/java-archive'", "fileExtension='.java',mimeType='application/octet-stream'", "fileExtension='.jck',mimeType='application/liquidmotion'", "fileExtension='.jcz',mimeType='application/liquidmotion'", "fileExtension='.jfif',mimeType='image/pjpeg'", "fileExtension='.jpb',mimeType='application/octet-stream'", "fileExtension='.jpe',mimeType='image/jpeg'", "fileExtension='.jpeg',mimeType='image/jpeg'", "fileExtension='.jpg',mimeType='image/jpeg'", "fileExtension='.js',mimeType='application/javascript'", "fileExtension='.json',mimeType='application/json'", "fileExtension='.jsx',mimeType='text/jscript'", "fileExtension='.latex',mimeType='application/x-latex'", "fileExtension='.lit',mimeType='application/x-ms-reader'", "fileExtension='.lpk',mimeType='application/octet-stream'", "fileExtension='.lsf',mimeType='video/x-la-asf'", "fileExtension='.lsx',mimeType='video/x-la-asf'", "fileExtension='.lzh',mimeType='application/octet-stream'", "fileExtension='.m13',mimeType='application/x-msmediaview'", "fileExtension='.m14',mimeType='application/x-msmediaview'", "fileExtension='.m1v',mimeType='video/mpeg'", "fileExtension='.m2ts',mimeType='video/vnd.dlna.mpeg-tts'", "fileExtension='.m3u',mimeType='audio/x-mpegurl'", "fileExtension='.m4a',mimeType='audio/mp4'", "fileExtension='.m4v',mimeType='video/mp4'", "fileExtension='.man',mimeType='application/x-troff-man'", "fileExtension='.manifest',mimeType='application/x-ms-manifest'", "fileExtension='.map',mimeType='text/plain'", "fileExtension='.mdb',mimeType='application/x-msaccess'", "fileExtension='.mdp',mimeType='application/octet-stream'", "fileExtension='.me',mimeType='application/x-troff-me'", "fileExtension='.mht',mimeType='message/rfc822'", "fileExtension='.mhtml',mimeType='message/rfc822'", "fileExtension='.mid',mimeType='audio/mid'", "fileExtension='.midi',mimeType='audio/mid'", "fileExtension='.mix',mimeType='application/octet-stream'", "fileExtension='.mmf',mimeType='application/x-smaf'", "fileExtension='.mno',mimeType='text/xml'", "fileExtension='.mny',mimeType='application/x-msmoney'", "fileExtension='.mov',mimeType='video/quicktime'", "fileExtension='.movie',mimeType='video/x-sgi-movie'", "fileExtension='.mp2',mimeType='video/mpeg'", "fileExtension='.mp3',mimeType='audio/mpeg'", "fileExtension='.mp4',mimeType='video/mp4'", "fileExtension='.mp4v',mimeType='video/mp4'", "fileExtension='.mpa',mimeType='video/mpeg'", "fileExtension='.mpe',mimeType='video/mpeg'", "fileExtension='.mpeg',mimeType='video/mpeg'", "fileExtension='.mpg',mimeType='video/mpeg'", "fileExtension='.mpp',mimeType='application/vnd.ms-project'", "fileExtension='.mpv2',mimeType='video/mpeg'", "fileExtension='.ms',mimeType='application/x-troff-ms'", "fileExtension='.msi',mimeType='application/octet-stream'", "fileExtension='.mso',mimeType='application/octet-stream'", "fileExtension='.mvb',mimeType='application/x-msmediaview'", "fileExtension='.mvc',mimeType='application/x-miva-compiled'", "fileExtension='.nc',mimeType='application/x-netcdf'", "fileExtension='.nsc',mimeType='video/x-ms-asf'", "fileExtension='.nws',mimeType='message/rfc822'", "fileExtension='.ocx',mimeType='application/octet-stream'", "fileExtension='.oda',mimeType='application/oda'", "fileExtension='.odc',mimeType='text/x-ms-odc'", "fileExtension='.ods',mimeType='application/oleobject'", "fileExtension='.oga',mimeType='audio/ogg'", "fileExtension='.ogg',mimeType='video/ogg'", "fileExtension='.ogv',mimeType='video/ogg'", "fileExtension='.one',mimeType='application/onenote'", "fileExtension='.onea',mimeType='application/onenote'", "fileExtension='.onetoc',mimeType='application/onenote'", "fileExtension='.onetoc2',mimeType='application/onenote'", "fileExtension='.onetmp',mimeType='application/onenote'", "fileExtension='.onepkg',mimeType='application/onenote'", "fileExtension='.osdx',mimeType='application/opensearchdescription+xml'", "fileExtension='.otf',mimeType='font/otf'", "fileExtension='.p10',mimeType='application/pkcs10'", "fileExtension='.p12',mimeType='application/x-pkcs12'", "fileExtension='.p7b',mimeType='application/x-pkcs7-certificates'", "fileExtension='.p7c',mimeType='application/pkcs7-mime'", "fileExtension='.p7m',mimeType='application/pkcs7-mime'", "fileExtension='.p7r',mimeType='application/x-pkcs7-certreqresp'", "fileExtension='.p7s',mimeType='application/pkcs7-signature'", "fileExtension='.pbm',mimeType='image/x-portable-bitmap'", "fileExtension='.pcx',mimeType='application/octet-stream'", "fileExtension='.pcz',mimeType='application/octet-stream'", "fileExtension='.pdf',mimeType='application/pdf'", "fileExtension='.pfb',mimeType='application/octet-stream'", "fileExtension='.pfm',mimeType='application/octet-stream'", "fileExtension='.pfx',mimeType='application/x-pkcs12'", "fileExtension='.pgm',mimeType='image/x-portable-graymap'", "fileExtension='.pko',mimeType='application/vnd.ms-pki.pko'", "fileExtension='.pma',mimeType='application/x-perfmon'", "fileExtension='.pmc',mimeType='application/x-perfmon'", "fileExtension='.pml',mimeType='application/x-perfmon'", "fileExtension='.pmr',mimeType='application/x-perfmon'", "fileExtension='.pmw',mimeType='application/x-perfmon'", "fileExtension='.png',mimeType='image/png'", "fileExtension='.pnm',mimeType='image/x-portable-anymap'", "fileExtension='.pnz',mimeType='image/png'", "fileExtension='.pot',mimeType='application/vnd.ms-powerpoint'", "fileExtension='.potm',mimeType='application/vnd.ms-powerpoint.template.macroEnabled.12'", "fileExtension='.potx',mimeType='application/vnd.openxmlformats-officedocument.presentationml.template'", "fileExtension='.ppam',mimeType='application/vnd.ms-powerpoint.addin.macroEnabled.12'", "fileExtension='.ppm',mimeType='image/x-portable-pixmap'", "fileExtension='.pps',mimeType='application/vnd.ms-powerpoint'", "fileExtension='.ppsm',mimeType='application/vnd.ms-powerpoint.slideshow.macroEnabled.12'", "fileExtension='.ppsx',mimeType='application/vnd.openxmlformats-officedocument.presentationml.slideshow'", "fileExtension='.ppt',mimeType='application/vnd.ms-powerpoint'", "fileExtension='.pptm',mimeType='application/vnd.ms-powerpoint.presentation.macroEnabled.12'", "fileExtension='.pptx',mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation'", "fileExtension='.prf',mimeType='application/pics-rules'", "fileExtension='.prm',mimeType='application/octet-stream'", "fileExtension='.prx',mimeType='application/octet-stream'", "fileExtension='.ps',mimeType='application/postscript'", "fileExtension='.psd',mimeType='application/octet-stream'", "fileExtension='.psm',mimeType='application/octet-stream'", "fileExtension='.psp',mimeType='application/octet-stream'", "fileExtension='.pub',mimeType='application/x-mspublisher'", "fileExtension='.qt',mimeType='video/quicktime'", "fileExtension='.qtl',mimeType='application/x-quicktimeplayer'", "fileExtension='.qxd',mimeType='application/octet-stream'", "fileExtension='.ra',mimeType='audio/x-pn-realaudio'", "fileExtension='.ram',mimeType='audio/x-pn-realaudio'", "fileExtension='.rar',mimeType='application/octet-stream'", "fileExtension='.ras',mimeType='image/x-cmu-raster'", "fileExtension='.rf',mimeType='image/vnd.rn-realflash'", "fileExtension='.rgb',mimeType='image/x-rgb'", "fileExtension='.rm',mimeType='application/vnd.rn-realmedia'", "fileExtension='.rmi',mimeType='audio/mid'", "fileExtension='.roff',mimeType='application/x-troff'", "fileExtension='.rpm',mimeType='audio/x-pn-realaudio-plugin'", "fileExtension='.rtf',mimeType='application/rtf'", "fileExtension='.rtx',mimeType='text/richtext'", "fileExtension='.scd',mimeType='application/x-msschedule'", "fileExtension='.sct',mimeType='text/scriptlet'", "fileExtension='.sea',mimeType='application/octet-stream'", "fileExtension='.setpay',mimeType='application/set-payment-initiation'", "fileExtension='.setreg',mimeType='application/set-registration-initiation'", "fileExtension='.sgml',mimeType='text/sgml'", "fileExtension='.sh',mimeType='application/x-sh'", "fileExtension='.shar',mimeType='application/x-shar'", "fileExtension='.sit',mimeType='application/x-stuffit'", "fileExtension='.sldm',mimeType='application/vnd.ms-powerpoint.slide.macroEnabled.12'", "fileExtension='.sldx',mimeType='application/vnd.openxmlformats-officedocument.presentationml.slide'", "fileExtension='.smd',mimeType='audio/x-smd'", "fileExtension='.smi',mimeType='application/octet-stream'", "fileExtension='.smx',mimeType='audio/x-smd'", "fileExtension='.smz',mimeType='audio/x-smd'", "fileExtension='.snd',mimeType='audio/basic'", "fileExtension='.snp',mimeType='application/octet-stream'", "fileExtension='.spc',mimeType='application/x-pkcs7-certificates'", "fileExtension='.spl',mimeType='application/futuresplash'", "fileExtension='.spx',mimeType='audio/ogg'", "fileExtension='.src',mimeType='application/x-wais-source'", "fileExtension='.ssm',mimeType='application/streamingmedia'", "fileExtension='.sst',mimeType='application/vnd.ms-pki.certstore'", "fileExtension='.stl',mimeType='application/vnd.ms-pki.stl'", "fileExtension='.sv4cpio',mimeType='application/x-sv4cpio'", "fileExtension='.sv4crc',mimeType='application/x-sv4crc'", "fileExtension='.svg',mimeType='image/svg+xml'", "fileExtension='.svgz',mimeType='image/svg+xml'", "fileExtension='.swf',mimeType='application/x-shockwave-flash'", "fileExtension='.t',mimeType='application/x-troff'", "fileExtension='.tar',mimeType='application/x-tar'", "fileExtension='.tcl',mimeType='application/x-tcl'", "fileExtension='.tex',mimeType='application/x-tex'", "fileExtension='.texi',mimeType='application/x-texinfo'", "fileExtension='.texinfo',mimeType='application/x-texinfo'", "fileExtension='.tgz',mimeType='application/x-compressed'", "fileExtension='.thmx',mimeType='application/vnd.ms-officetheme'", "fileExtension='.thn',mimeType='application/octet-stream'", "fileExtension='.tif',mimeType='image/tiff'", "fileExtension='.tiff',mimeType='image/tiff'", "fileExtension='.toc',mimeType='application/octet-stream'", "fileExtension='.tr',mimeType='application/x-troff'", "fileExtension='.trm',mimeType='application/x-msterminal'", "fileExtension='.ts',mimeType='video/vnd.dlna.mpeg-tts'", "fileExtension='.tsv',mimeType='text/tab-separated-values'", "fileExtension='.ttf',mimeType='application/octet-stream'", "fileExtension='.tts',mimeType='video/vnd.dlna.mpeg-tts'", "fileExtension='.txt',mimeType='text/plain'", "fileExtension='.u32',mimeType='application/octet-stream'", "fileExtension='.uls',mimeType='text/iuls'", "fileExtension='.ustar',mimeType='application/x-ustar'", "fileExtension='.vbs',mimeType='text/vbscript'", "fileExtension='.vcf',mimeType='text/x-vcard'", "fileExtension='.vcs',mimeType='text/plain'", "fileExtension='.vdx',mimeType='application/vnd.ms-visio.viewer'", "fileExtension='.vml',mimeType='text/xml'", "fileExtension='.vsd',mimeType='application/vnd.visio'", "fileExtension='.vss',mimeType='application/vnd.visio'", "fileExtension='.vst',mimeType='application/vnd.visio'", "fileExtension='.vsto',mimeType='application/x-ms-vsto'", "fileExtension='.vsw',mimeType='application/vnd.visio'", "fileExtension='.vsx',mimeType='application/vnd.visio'", "fileExtension='.vtx',mimeType='application/vnd.visio'", "fileExtension='.wav',mimeType='audio/wav'", "fileExtension='.wax',mimeType='audio/x-ms-wax'", "fileExtension='.wbmp',mimeType='image/vnd.wap.wbmp'", "fileExtension='.wcm',mimeType='application/vnd.ms-works'", "fileExtension='.wdb',mimeType='application/vnd.ms-works'", "fileExtension='.webm',mimeType='video/webm'", "fileExtension='.wks',mimeType='application/vnd.ms-works'", "fileExtension='.wm',mimeType='video/x-ms-wm'", "fileExtension='.wma',mimeType='audio/x-ms-wma'", "fileExtension='.wmd',mimeType='application/x-ms-wmd'", "fileExtension='.wmf',mimeType='application/x-msmetafile'", "fileExtension='.wml',mimeType='text/vnd.wap.wml'", "fileExtension='.wmlc',mimeType='application/vnd.wap.wmlc'", "fileExtension='.wmls',mimeType='text/vnd.wap.wmlscript'", "fileExtension='.wmlsc',mimeType='application/vnd.wap.wmlscriptc'", "fileExtension='.wmp',mimeType='video/x-ms-wmp'", "fileExtension='.wmv',mimeType='video/x-ms-wmv'", "fileExtension='.wmx',mimeType='video/x-ms-wmx'", "fileExtension='.wmz',mimeType='application/x-ms-wmz'", "fileExtension='.woff',mimeType='font/x-woff'", "fileExtension='.wps',mimeType='application/vnd.ms-works'", "fileExtension='.wri',mimeType='application/x-mswrite'", "fileExtension='.wrl',mimeType='x-world/x-vrml'", "fileExtension='.wrz',mimeType='x-world/x-vrml'", "fileExtension='.wsdl',mimeType='text/xml'", "fileExtension='.wtv',mimeType='video/x-ms-wtv'", "fileExtension='.wvx',mimeType='video/x-ms-wvx'", "fileExtension='.x',mimeType='application/directx'", "fileExtension='.xaf',mimeType='x-world/x-vrml'", "fileExtension='.xaml',mimeType='application/xaml+xml'", "fileExtension='.xap',mimeType='application/x-silverlight-app'", "fileExtension='.xbap',mimeType='application/x-ms-xbap'", "fileExtension='.xbm',mimeType='image/x-xbitmap'", "fileExtension='.xdr',mimeType='text/plain'", "fileExtension='.xht',mimeType='application/xhtml+xml'", "fileExtension='.xhtml',mimeType='application/xhtml+xml'", "fileExtension='.xla',mimeType='application/vnd.ms-excel'", "fileExtension='.xlam',mimeType='application/vnd.ms-excel.addin.macroEnabled.12'", "fileExtension='.xlc',mimeType='application/vnd.ms-excel'", "fileExtension='.xlm',mimeType='application/vnd.ms-excel'", "fileExtension='.xls',mimeType='application/vnd.ms-excel'", "fileExtension='.xlsb',mimeType='application/vnd.ms-excel.sheet.binary.macroEnabled.12'", "fileExtension='.xlsm',mimeType='application/vnd.ms-excel.sheet.macroEnabled.12'", "fileExtension='.xlsx',mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'", "fileExtension='.xlt',mimeType='application/vnd.ms-excel'", "fileExtension='.xltm',mimeType='application/vnd.ms-excel.template.macroEnabled.12'", "fileExtension='.xltx',mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.template'", "fileExtension='.xlw',mimeType='application/vnd.ms-excel'", "fileExtension='.xml',mimeType='text/xml'", "fileExtension='.xof',mimeType='x-world/x-vrml'", "fileExtension='.xpm',mimeType='image/x-xpixmap'", "fileExtension='.xps',mimeType='application/vnd.ms-xpsdocument'", "fileExtension='.xsd',mimeType='text/xml'", "fileExtension='.xsf',mimeType='text/xml'", "fileExtension='.xsl',mimeType='text/xml'", "fileExtension='.xslt',mimeType='text/xml'", "fileExtension='.xsn',mimeType='application/octet-stream'", "fileExtension='.xtp',mimeType='application/octet-stream'", "fileExtension='.xwd',mimeType='image/x-xwindowdump'", "fileExtension='.z',mimeType='application/x-compress'", "fileExtension='.zip',mimeType='application/x-zip-compressed'"]
```
- `add_default_documents` - The items you want to add to the default document collection, only used during `:add`. Array of strings, default: `[]`
- `add_mime_maps` - The items you want to add to the mime-map/mime-type collection, only used during `:add`. Array of strings, default: `[]`
- `delete_default_documents` - The items you want to delete from the default document collection, only used during `:delete`. Array of strings, default: `[]`
- `delete_mime_maps` - The items you want to delete from the mime-map/mime-type collection, only used during `:delete`. Array of strings, default: `[]`

### Examples

```ruby
# Add foo.html to default documents, and add '.dmg' as mime type extension at root level
iis_root 'add stuff' do
  add_default_documents ['foo.html']
  add_mime_maps ["fileExtension='.dmg',mimeType='application/octet-stream'"]
  action :add
end
```
```ruby
# Remove index.html from default document and .323 as a mime type at root level
iis_root 'delete stuff' do
  delete_default_documents ['index.html']
  delete_mime_maps ["fileExtension='.323',mimeType='text/h323'"]
  action :delete
end
```
iis_site
---------

Allows for easy management of IIS virtual sites (ie vhosts).

### Actions

- `:add` - add a new virtual site
- `:config` - apply configuration to an existing virtual site
- `:delete` - delete an existing virtual site
- `:start` - start a virtual site
- `:stop` - stop a virtual site
- `:restart` - restart a virtual site

### Attribute Parameters

- `site_name` - name attribute.
- `site_id` - if not given IIS generates a unique ID for the site
- `path` - IIS will create a root application and a root virtual directory mapped to this specified local path
- `protocol` - http protocol type the site should respond to. valid values are :http, :https. default is :http
- `port` - port site will listen on. default is 80
- `host_header` - host header (also known as domains or host names) the site should map to. default is all host headers
- `options` - additional options to configure the site
- `bindings` - Advanced options to configure the information required for requests to communicate with a Web site. See http://www.iis.net/configreference/system.applicationhost/sites/site/bindings/binding for parameter format. When binding is used, port protocol and host_header should not be used.
- `application_pool` - set the application pool of the site
- `options` - support for additional options -logDir, -limits, -ftpServer, etc...
- `log_directory` - specifies the logging directory, where the log file and logging-related support files are stored.
- `log_period` - specifies how often iis creates a new log file
- `log_truncsize` - specifies the maximum size of the log file (in bytes) after which to create a new log file.

### Examples

```ruby
# stop and delete the default site
iis_site 'Default Web Site' do
  action [:stop, :delete]
end
```

```ruby
# create and start a new site that maps to
# the physical location C:\inetpub\wwwroot\testfu
# first the physical location must exist
directory "#{node['iis']['docroot']}/testfu" do
  action :create
end

# now create and start the site (note this will use the default application pool which must exist)
iis_site 'Testfu Site' do
  protocol :http
  port 80
  path "#{node['iis']['docroot']}/testfu"
  action [:add,:start]
end
```

```ruby
# do the same but map to testfu.chef.io domain
# first the physical location must exist
directory "#{node['iis']['docroot']}/testfu" do
  action :create
end

# now create and start the site (note this will use the default application pool which must exist)
iis_site 'Testfu Site' do
  protocol :http
  port 80
  path "#{node['iis']['docroot']}/testfu"
  host_header "testfu.chef.io"
  action [:add,:start]
end
```

```ruby
# create and start a new site that maps to
# the physical C:\inetpub\wwwroot\testfu
# first the physical location must exist
directory "#{node['iis']['docroot']}/testfu" do
  action :create
end

# also adds bindings to http and https
# binding http to the ip address 10.12.0.136,
# the port 80, and the host header www.domain.com
# also binding https to any ip address,
# the port 443, and the host header www.domain.com
# now create and start the site (note this will use the default application pool which must exist)
iis_site 'FooBar Site' do
  bindings "http/10.12.0.136:80:www.domain.com,https/*:443:www.domain.com
  path "#{node['iis']['docroot']}/testfu"
  action [:add,:start]
end
```

iis_config
-----------
Runs a config command on your IIS instance.

### Actions

- `:set` - Edit configuration section (appcmd set config)
- `:clear` - Clear the section configuration (appcmd clear config)
- `:config` - [ DEPRECATED ] use `:set` instead

### Attribute Parameters

- `cfg_cmd` - name attribute. What ever command you would pass in after "appcmd.exe set config"

### Example

```ruby
# Sets up logging
iis_config "/section:system.applicationHost/sites /siteDefaults.logfile.directory:\"D:\\logs\"" do
    action :set
end
```

```ruby
# Increase file upload size for 'MySite'
iis_config "\"MySite\" /section:requestfiltering /requestlimits.maxallowedcontentlength:50000000" do
  action :set
end
```

```ruby
# Set IUSR username and password authentication
iis_config "\"MyWebsite/aSite\" -section:system.webServer/security/authentication/anonymousAuthentication /enabled:\"True\" /userName:\"IUSR_foobar\" /password:\"p@assword\" /commit:apphost" do
  action :set
end
```

```ruby
# Authenticate with application pool
iis_config "\"MyWebsite/aSite\" -section:system.webServer/security/authentication/anonymousAuthentication /enabled:\"True\" /userName:\"\" /commit:apphost" do
   action :set
end

```

```ruby
# Loads an array of commands from the node
cfg_cmds = node['iis']['cfg_cmd']
cfg_cmds.each do |cmd|
    iis_config "#{cmd}" do
        action :set
    end
end
```

```ruby
# Add static machine key at site level
iis_config "MySite /commit:site /section:machineKey /validation:AES /validationKey:AAAAAA /decryptionKey:ZZZZZ" do
  action :set
end
```

```ruby
# Remove machine key
iis_config "MySite /commit:site /section:machineKey"
  action :clear
end
```


iis_pool
---------
Creates an application pool in IIS.

### Actions

- `:add` - add a new application pool
- `:config` - apply configuration to an existing application pool
- `:delete` - delete an existing application pool
- `:start` - start a application pool
- `:stop` - stop a application pool
- `:restart` - restart a application pool
- `:recycle` - recycle an application pool

### Attribute Parameters

#### Root Items
- `pool_name` - name attribute. Specifies the name of the pool to create.
- `runtime_version` - specifies what .NET version of the runtime to use.
- `pipeline_mode` - specifies what pipeline mode to create the pool with, valid values are :Integrated or :Classic, the default is :Integrated
- `no_managed_code` - allow Unmanaged Code in setting up IIS app pools is shutting down. - default is true - optional

#### Add Items
- `start_mode` - Specifies the startup type for the application pool - default :OnDemand (:OnDemand, :AlwaysRunning) - optional
- `auto_start` - When true, indicates to the World Wide Web Publishing Service (W3SVC) that the application pool should be automatically started when it is created or when IIS is started. - boolean: default true - optional
- `queue_length` - Indicates to HTTP.sys how many requests to queue for an application pool before rejecting future requests. - default is 1000 - optional
- `thirty_two_bit` - set the pool to run in 32 bit mode, valid values are true or false, default is false - optional

#### Process Model Items
- `max_proc` - specifies the number of worker processes associated with the pool.
- `load_user_profile` - This property is used only when a service starts in a named user account. - Default is false - optional
- `pool_identity` - the account identity that they app pool will run as, valid values are :SpecificUser, :NetworkService, :LocalService, :LocalSystem, :ApplicationPoolIdentity
- `pool_username` - username for the identity for the application pool
- `pool_password` password for the identity for the application pool is started. Default is true - optional
- `logon_type` - Specifies the logon type for the process identity. (For additional information about [logon types](http://msdn.microsoft.com/en-us/library/aa378184%28VS.85%29.aspx), see the LogonUser Function topic on Microsoft's MSDN Web site.) - Available [:LogonBatch, :LogonService] - default is :LogonBatch - optional
- `manual_group_membership` - Specifies whether the IIS_IUSRS group Security Identifier (SID) is added to the worker process token. When false, IIS automatically uses an application pool identity as though it were a member of the built-in IIS_IUSRS group, which has access to necessary file and system resources. When true, an application pool identity must be explicitly added to all resources that a worker process requires at runtime. - default is false - optional
- `idle_timeout` - Specifies how long (in minutes) a worker process should run idle if no new requests are received and the worker process is not processing requests. After the allocated time passes, the worker process should request that it be shut down by the WWW service. - default is '00:20:00' - optional
- `idle_timeout_action` - Specifies the option of suspending an idle worker process rather than terminating it. Valid values are :Terminate and :Suspend - optional
- `shutdown_time_limit` - Specifies the time that the W3SVC service waits after it initiated a recycle. If the worker process does not shut down within the shutdownTimeLimit, it will be terminated by the W3SVC service. - default is '00:01:30' - optional
- `startup_time_limit` - Specifies the time that IIS waits for an application pool to start. If the application pool does not startup within the startupTimeLimit, the worker process is terminated and the rapid-fail protection count is incremented. - default is '00:01:30' - optional
- `pinging_enabled` - Specifies whether pinging is enabled for the worker process. - default is true - optional
- `ping_interval` - Specifies the time between health-monitoring pings that the WWW service sends to a worker process - default is '00:00:30' - optional
- `ping_response_time` - Specifies the time that a worker process is given to respond to a health-monitoring ping. After the time limit is exceeded, the WWW service terminates the worker process - default is '00:01:30' - optional

#### Recycling Items
- `disallow_rotation_on_config_change` - The DisallowRotationOnConfigChange property specifies whether or not the World Wide Web Publishing Service (WWW Service) should rotate worker processes in an application pool when the configuration has changed. - Default is false - optional
- `disallow_overlapping_rotation` - Specifies whether the WWW Service should start another worker process to replace the existing worker process while that process
- `recycle_after_time` - specifies a pool to recycle at regular time intervals, d.hh:mm:ss, d optional
- `recycle_at_time` - schedule a pool to recycle at a specific time, d.hh:mm:ss, d optional
- `private_mem` - specifies the amount of private memory (in kilobytes) after which you want the pool to recycle

#### Failure Items
- `load_balancer_capabilities` - Specifies behavior when a worker process cannot be started, such as when the request queue is full or an application pool is in rapid-fail protection. - default is :HttpLevel - optional
- `orphan_worker_process` - Specifies whether to assign a worker process to an orphan state instead of terminating it when an application pool fails. - default is false - optional
- `orphan_action_exe` - Specifies an executable to run when the WWW service orphans a worker process (if the orphanWorkerProcess attribute is set to true). You can use the orphanActionParams attribute to send parameters to the executable. - optional
- `orphan_action_params` - Indicates command-line parameters for the executable named by the orphanActionExe attribute. To specify the process ID of the orphaned process, use %1%. - optional
- `rapid_fail_protection` - Setting to true instructs the WWW service to remove from service all applications that are in an application pool - default is true - optional
- `rapid_fail_protection_interval` - Specifies the number of minutes before the failure count for a process is reset. - default is '00:05:00' - optional
- `rapid_fail_protection_max_crashes` - Specifies the maximum number of failures that are allowed within the number of minutes specified by the rapidFailProtectionInterval attribute. - default is 5 - optional
- `auto_shutdown_exe` - Specifies an executable to run when the WWW service shuts down an application pool. - optional
- `auto_shutdown_params` - Specifies command-line parameters for the executable that is specified in the autoShutdownExe attribute. - optional

#### CPU Items
- `cpu_action` - Configures the action that IIS takes when a worker process exceeds its configured CPU limit. The action attribute is configured on a per-application pool basis. - Available options [:NoAction, :KillW3wp, :Throttle, :ThrottleUnderLoad] - default is :NoAction - optional
- `cpu_limit` - Configures the maximum percentage of CPU time (in 1/1000ths of one percent) that the worker processes in an application pool are allowed to consume over a period of time as indicated by the resetInterval attribute. If the limit set by the limit attribute is exceeded, an event is written to the event log and an optional set of events can be triggered. These optional events are determined by the action attribute. - default is 0 - optional
- `cpu_reset_interval` - Specifies the reset period (in minutes) for CPU monitoring and throttling limits on an application pool. When the number of minutes elapsed since the last process accounting reset equals the number specified by this property, IIS resets the CPU timers for both the logging and limit intervals. - default is '00:05:00' - optional
- `cpu_smp_affinitized` - Specifies whether a particular worker process assigned to an application pool should also be assigned to a given CPU. - default is false - optional
- `smp_processor_affinity_mask` - Specifies the hexadecimal processor mask for multi-processor computers, which indicates to which CPU the worker processes in an application pool should be bound. Before this property takes effect, the smpAffinitized attribute must be set to true for the application pool. - default is 4294967295 - optional
- `smp_processor_affinity_mask_2` - Specifies the high-order DWORD hexadecimal processor mask for 64-bit multi-processor computers, which indicates to which CPU the worker processes in an application pool should be bound. Before this property takes effect, the smpAffinitized attribute must be set to true for the application pool. - default is 4294967295 - optional

### Example

```ruby
# creates a new app pool
iis_pool 'myAppPool_v1_1' do
  runtime_version "2.0"
  pipeline_mode :Classic
  action :add
end
```

iis_app
--------

Creates an application in IIS.

### Actions

- `:add` - add a new application pool
- `:delete` - delete an existing application pool
- `:config` - configures an existing application pool

### Attribute Parameters

- `site_name` - name attribute. The name of the site to add this app to
- `path` -The virtual path for this application
- `application_pool` - The pool this application belongs to
- `physical_path` - The physical path where this app resides.
- `enabled_protocols` - The enabled protocols that this app provides (http, https, net.pipe, net.tcp, etc)

### Example

```ruby
# creates a new app
iis_app "myApp" do
  path "/v1_1"
  application_pool "myAppPool_v1_1"
  physical_path "#{node['iis']['docroot']}/testfu/v1_1"
  enabled_protocols "http,net.pipe"
  action :add
end
```

iis_vdir
---------

Allows easy management of IIS virtual directories (i.e. vdirs).

### Actions

- :add: - add a new virtual directory
- :delete: - delete an existing virtual directory
- :config: - configure a virtual directory

### Attribute Parameters

- `application_name`: name attribute. Specifies the name of the application attribute.  This is the name of the website or application you are adding it to.
- `path`: The virtual directory path on the site.
- `physical_path`: The physical path of the virtual directory on the disk.
- `username`: (optional) The username required to logon to the physical_path. If set to "" will clear username and password.
- `password`: (optional) The password required to logon to the physical_path
- `logon_method`: (optional, default: :ClearText) The method used to logon (:Interactive, :Batch, :Network, :ClearText). For more information on these types, see "LogonUser Function", Read more at [MSDN](http://msdn2.microsoft.com/en-us/library/aa378184.aspx)
- `allow_sub_dir_config`: (optional, default: true) Boolean that specifies whether or not the Web server will look for configuration files located in the subdirectories of this virtual directory. Setting this to false can improve performance on servers with very large numbers of web.config files, but doing so prevents IIS configuration from being read in subdirectories.

### Examples

```ruby
# add a virtual directory to default application
iis_vdir 'Default Web Site/' do
  action :add
  path '/Content/Test'
  physical_path 'C:\wwwroot\shared\test'
end
```

```ruby
# add a virtual directory to an application under a site
iis_vdir 'Default Web Site/my application' do
  action :add
  path '/Content/Test'
  physical_path 'C:\wwwroot\shared\test'
end
```

```ruby
# adds a virtual directory to default application which points to a smb share. (Remember to escape the "\"'s)
iis_vdir 'Default Web Site/' do
  action :add
  path '/Content/Test'
  physical_path '\\\\sharename\\sharefolder\\1'
end
```

```ruby
# configure a virtual directory to have a username and password
iis_vdir 'Default Web Site/' do
  action :config
  path '/Content/Test'
  username 'domain\myspecialuser'
  password 'myspecialpassword'
end
```

```ruby
# delete a virtual directory from the default application
iis_vdir 'Default Web Site/' do
  action :delete
  path '/Content/Test'
end
```

iis_section
---------

Allows for the locking/unlocking of sections ([listed here](http://www.iis.net/configreference) or via the command `appcmd list config \"\"  /config:* /xml`)

This is valuable to allow the `web.config` of an individual application/website control it's own settings.

### Actions

- `:lock`: - locks the `section` passed
- `:unlock`: - unlocks the `section` passed

### Attribute Parameters

- `section`: The name of the section to lock.
- `returns`: The result of the `shell_out` command.

### Examples

```ruby
# Sets the IIS global windows authentication to be locked globally
iis_section 'locks global configuration of windows auth' do
  section 'system.webServer/security/authentication/windowsAuthentication'
  action :lock
end
```

```ruby
# Sets the IIS global Basic authentication to be locked globally
iis_section 'locks global configuration of Basic auth' do
  section 'system.webServer/security/authentication/basicAuthentication'
  action :lock
end
```

```ruby
# Sets the IIS global windows authentication to be unlocked globally
iis_section 'unlocked web.config globally for windows auth' do
  action :unlock
  section 'system.webServer/security/authentication/windowsAuthentication'
end
```

```ruby
# Sets the IIS global Basic authentication to be unlocked globally
iis_section 'unlocked web.config globally for Basic auth' do
  action :unlock
  section 'system.webServer/security/authentication/basicAuthentication'
end
```

iis_module
--------

Manages modules globally or on a per site basis.

### Actions

- `:add` - add a new module
- `:delete` - delete a module
- `:install` - install a native module from the filesystem (.dll)
- `:uninstall` - uninstall a native module

### Attribute Parameters

- `module_name` - The name of the module to add or delete
- `type` - The type of module
- `precondition` - precondition for module
- `application` - The application or site to add the module to
- `add` - Whether the module you install has to be globally added
- `image` - Location of the DLL of the module to install

### Example

```ruby
# Adds a module called "My 3rd Party Module" to mySite/
iis_module "My 3rd Party Module" do
  application "mySite/"
  precondition "bitness64"
  action :add
end
```

```ruby
# Adds a module called "MyModule" to all IIS sites on the server
iis_module "MyModule"
```


Usage
=====

default
-------

Installs and configures IIS 7.0/7.5/8.0 using the default configuration.

mod_*
-----

This cookbook also contains recipes for installing individual IIS modules (extensions).  These recipes can be included in a node's run_list to build the minimal desired custom IIS installation.

* `mod_aspnet` - installs ASP.NET runtime components
* `mod_aspnet45` - installs ASP.NET 4.5 runtime components
* `mod_auth_basic` - installs Basic Authentication support
* `mod_auth_windows` - installs Windows Authentication (authenticate clients by using NTLM or Kerberos) support
* `mod_compress_dynamic` - installs dynamic content compression support. *PLEASE NOTE* - enabling dynamic compression always gives you more efficient use of bandwidth, but if your server's processor utilization is already very high, the CPU load imposed by dynamic compression might make your site perform more slowly.
* `mod_compress_static` - installs static content compression support
* `mod_iis6_metabase_compat` - installs IIS 6 Metabase Compatibility component.
* `mod_isapi` - installs ISAPI (Internet Server Application Programming Interface) extension and filter support.
* `mod_logging` - installs and enables HTTP Logging (logging of Web site activity), Logging Tools (logging tools and scripts) and Custom Logging (log any of the HTTP request/response headers, IIS server variables, and client-side fields with simple configuration) support
* `mod_management` - installs Web server Management Console which supports management of local and remote Web servers
* `mod_security` - installs URL Authorization (Authorizes client access to the URLs that comprise a Web application), Request Filtering (configures rules to block selected client requests) and IP Security (allows or denies content access based on IP address or domain name) support.
* `mod_tracing` -  installs support for tracing ASP.NET applications and failed requests.

Note: Not every possible IIS module has a corresponding recipe. The foregoing recipes are included for convenience, but users may also place additional IIS modules that are installable as Windows features into the ``node['iis']['components']`` array.

Alternatives
=====
* [Powershell based IIS Cookbook (Pre-DSC)](https://github.com/ebsco/iisposh)
* DSC Based- [CWebAdministration](https://github.com/PowerShellOrg/cWebAdministration) / [XWebadministration](https://github.com/PowerShell/xWebAdministration) Powershell Module(s)

License and Author
==================

* Author:: Seth Chisamore (<schisamo@chef.io>)
* Author:: Julian Dunn (<jdunn@chef.io>)
* Author:: Justin Schuhmann (<jmschu02@gmail.com>)

Copyright:: 2011-2015, Chef Software, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
