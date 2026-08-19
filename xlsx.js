// ========================================================
// xlsx.js — a minimal, dependency-free .xlsx writer.
//
// Only what this document needs: multiple worksheets (the tabs), a
// small style table, column widths, frozen headers and merged title
// rows. Strings are written inline, so there is no shared-string table
// to keep in sync.
// ========================================================
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');

const colName = n => { let s=''; n=n+1; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26; } return s; };

// Style slots, referenced by name so the sheets never hardcode an index.
const S = { plain:0, bold:1, title:2, head:3, num1:4, num2:5, note:6, band:7, split:8, left:9, sub:10, headL:11 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="model" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts>
<fonts count="6">
 <font><sz val="11"/><name val="Calibri"/></font>
 <font><b/><sz val="11"/><name val="Calibri"/></font>
 <font><b/><sz val="14"/><color rgb="FF1F4F8F"/><name val="Calibri"/></font>
 <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
 <font><i/><sz val="10"/><color rgb="FF5C6577"/><name val="Calibri"/></font>
 <font><b/><sz val="11"/><color rgb="FF1F4F8F"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
 <fill><patternFill patternType="none"/></fill>
 <fill><patternFill patternType="gray125"/></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF1F4F8F"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
 <border><left/><right/><top/><bottom/><diagonal/></border>
 <border><left style="thin"><color rgb="FFBFC7D4"/></left><right style="thin"><color rgb="FFBFC7D4"/></right><top style="thin"><color rgb="FFBFC7D4"/></top><bottom style="thin"><color rgb="FFBFC7D4"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
 <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
 <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
 <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
 <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
 <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>
 <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>
 <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
 <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left"/></xf>
 <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>
 <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left"/></xf>
 <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
 <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`.replace('numFmtId="model"','numFmtId="164"');

// A cell is [value, styleIndex]. Numbers become numeric cells, everything
// else an inline string, so Excel sorts and sums the numbers properly.
function cellXml(v, s, ref) {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s|0}"/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${s|0}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${s|0}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml({ rows, cols = [], freeze = null, merges = [] }) {
  const body = rows.map((row, i) => {
    if (!row) return `<row r="${i+1}"/>`;
    const cells = row.map((c, j) => {
      const [v, s] = Array.isArray(c) ? c : [c, 0];
      return cellXml(v, s, colName(j) + (i+1));
    }).join('');
    return `<row r="${i+1}">${cells}</row>`;
  }).join('');
  const colsXml = cols.length
    ? `<cols>${cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const pane = freeze
    ? `<pane xSplit="${freeze.x||0}" ySplit="${freeze.y||0}" topLeftCell="${colName(freeze.x||0)}${(freeze.y||0)+1}" activePane="bottomRight" state="frozen"/>`
    : '';
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView showGridLines="0"${rows.length?' workbookViewId="0"':''}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${colsXml}
<sheetData>${body}</sheetData>${mergeXml}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function write(outPath, sheets) {
  const dir = outPath + '.parts';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'xl', 'worksheets'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_rels'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'xl', '_rels'), { recursive: true });

  const n = sheets.length;
  fs.writeFileSync(path.join(dir,'[Content_Types].xml'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`);

  fs.writeFileSync(path.join(dir,'_rels','.rels'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  fs.writeFileSync(path.join(dir,'xl','workbook.xml'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s,i)=>`<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>
</workbook>`);

  fs.writeFileSync(path.join(dir,'xl','_rels','workbook.xml.rels'),
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('\n')}
<Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  fs.writeFileSync(path.join(dir,'xl','styles.xml'), STYLES);
  sheets.forEach((s,i)=> fs.writeFileSync(path.join(dir,'xl','worksheets',`sheet${i+1}.xml`), sheetXml(s)));

  fs.rmSync(outPath, { force: true });
  execFileSync('zip', ['-q','-X','-r', path.resolve(outPath), '.'], { cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  return fs.statSync(outPath).size;
}

module.exports = { write, S, colName };
