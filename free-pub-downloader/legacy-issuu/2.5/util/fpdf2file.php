<?php
require('fpdf.php');

class FPDF2File extends FPDF
{
var $f;

function Open($file='doc.pdf')
{
	if(FPDF_VERSION<'1.7')
		$this->Error('Version 1.7 or above is required by this extension');
	$this->f=fopen($file,'wb');
	if(!$this->f)
		$this->Error('Unable to create output file: '.$file);
	parent::Open();
	$this->_putheader();
}

function Image($file, $x=null, $y=null, $w=0, $h=0, $type='', $link='')
{
	if(!isset($this->images[$file]))
	{
		//Retrieve only meta-information
		$a=getimagesize($file);
		if($a===false)
			$this->Error('Missing or incorrect image file: '.$file);
		$this->images[$file]=array('w'=>$a[0],'h'=>$a[1],'type'=>$a[2],'i'=>count($this->images)+1);
	}
	parent::Image($file,$x,$y,$w,$h,$type,$link);
}

function Output($name=null, $dest=null)
{
	if($this->state<3)
		$this->Close();
}

function _endpage()
{
	parent::_endpage();
	//Write page to file
	$filter=($this->compress) ? '/Filter /FlateDecode ' : '';
	$p=($this->compress) ? gzcompress($this->buffer) : $this->buffer;
	$this->_newobj();
	$this->_out('<<'.$filter.'/Length '.strlen($p).'>>');
	$this->_putstream($p);
	$this->_out('endobj');
	$this->buffer='';
}

function _newobj()
{
	$this->n++;
	$this->offsets[$this->n]=ftell($this->f);
	$this->_out($this->n.' 0 obj');
}

function _out($s)
{
	if($this->state==2)
		$this->buffer.=$s."\n";
	else
		fwrite($this->f,$s."\n",strlen($s)+1);
}

function _putimages()
{
	foreach(array_keys($this->images) as $file)
	{
		$type=$this->images[$file]['type'];
		if($type==1)
			$info=$this->_parsegif($file);
		elseif($type==2)
			$info=$this->_parsejpg($file);
		elseif($type==3)
			$info=$this->_parsepng($file);
		else
			$this->Error('Unsupported image type: '.$file);
		$this->_putimage($info);
		$this->images[$file]['n']=$info['n'];
		unset($info);
	}
}

function _putpages()
{
	$nb=$this->page;
	if($this->DefOrientation=='P')
	{
		$wPt=$this->DefPageSize[0]*$this->k;
		$hPt=$this->DefPageSize[1]*$this->k;
	}
	else
	{
		$wPt=$this->DefPageSize[1]*$this->k;
		$hPt=$this->DefPageSize[0]*$this->k;
	}
	//Page objects
	for($n=1;$n<=$nb;$n++)
	{
		$this->_newobj();
		$this->_out('<</Type /Page');
		$this->_out('/Parent 1 0 R');
		if(isset($this->PageSizes[$n]))
			$this->_out(sprintf('/MediaBox [0 0 %.2F %.2F]',$this->PageSizes[$n][0],$this->PageSizes[$n][1]));
		$this->_out('/Resources 2 0 R');
		if(isset($this->PageLinks[$n]))
		{
			//Links
			$annots='/Annots [';
			foreach($this->PageLinks[$n] as $pl)
			{
				$rect=sprintf('%.2F %.2F %.2F %.2F',$pl[0],$pl[1],$pl[0]+$pl[2],$pl[1]-$pl[3]);
				$annots.='<</Type /Annot /Subtype /Link /Rect ['.$rect.'] /Border [0 0 0] ';
				if(is_string($pl[4]))
					$annots.='/A <</S /URI /URI '.$this->_textstring($pl[4]).'>>>>';
				else
				{
					$l=$this->links[$pl[4]];
					$h=isset($this->PageSizes[$l[0]]) ? $this->PageSizes[$l[0]][1] : $hPt;
					$annots.=sprintf('/Dest [%d 0 R /XYZ 0 %.2F null]>>',2+$nb+$l[0],$h-$l[1]*$this->k);
				}
			}
			$this->_out($annots.']');
		}
		$this->_out('/Contents '.(2+$n).' 0 R>>');
		$this->_out('endobj');
	}
	//Pages root
	$this->offsets[1]=ftell($this->f);
	$this->_out('1 0 obj');
	$this->_out('<</Type /Pages');
	$kids='/Kids [';
	for($n=1;$n<=$nb;$n++)
		$kids.=(2+$nb+$n).' 0 R ';
	$this->_out($kids.']');
	$this->_out('/Count '.$nb);
	$this->_out(sprintf('/MediaBox [0 0 %.2F %.2F]',$wPt,$hPt));
	$this->_out('>>');
	$this->_out('endobj');
}

function _putresources()
{
	$this->_putfonts();
	$this->_putimages();
	//Resource dictionary
	$this->offsets[2]=ftell($this->f);
	$this->_out('2 0 obj');
	$this->_out('<<');
	$this->_putresourcedict();
	$this->_out('>>');
	$this->_out('endobj');
}

function _putcatalog()
{
	$this->_out('/Type /Catalog');
	$this->_out('/Pages 1 0 R');
	$n=3+$this->page;
	if($this->ZoomMode=='fullpage')
		$this->_out('/OpenAction ['.$n.' 0 R /Fit]');
	elseif($this->ZoomMode=='fullwidth')
		$this->_out('/OpenAction ['.$n.' 0 R /FitH null]');
	elseif($this->ZoomMode=='real')
		$this->_out('/OpenAction ['.$n.' 0 R /XYZ null null 1]');
	elseif(!is_string($this->ZoomMode))
		$this->_out('/OpenAction ['.$n.' 0 R /XYZ null null '.($this->ZoomMode/100).']');
	if($this->LayoutMode=='single')
		$this->_out('/PageLayout /SinglePage');
	elseif($this->LayoutMode=='continuous')
		$this->_out('/PageLayout /OneColumn');
	elseif($this->LayoutMode=='two')
		$this->_out('/PageLayout /TwoColumnLeft');
}

function _enddoc()
{
	$this->_putpages();
	$this->_putresources();
	//Info
	$this->_newobj();
	$this->_out('<<');
	$this->_putinfo();
	$this->_out('>>');
	$this->_out('endobj');
	//Catalog
	$this->_newobj();
	$this->_out('<<');
	$this->_putcatalog();
	$this->_out('>>');
	$this->_out('endobj');
	//Cross-ref
	$o=ftell($this->f);
	$this->_out('xref');
	$this->_out('0 '.($this->n+1));
	$this->_out('0000000000 65535 f ');
	for($i=1;$i<=$this->n;$i++)
		$this->_out(sprintf('%010d 00000 n ',$this->offsets[$i]));
	//Trailer
	$this->_out('trailer');
	$this->_out('<<');
	$this->_puttrailer();
	$this->_out('>>');
	$this->_out('startxref');
	$this->_out($o);
	$this->_out('%%EOF');
	$this->state=3;
	fclose($this->f);
}
}
?>
