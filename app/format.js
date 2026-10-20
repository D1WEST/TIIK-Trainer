(function(root) {
  'use strict';
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(text, marked, katex, errors=[]) {
    // Plain numeric matrix blocks become proper matrices. Annotated blocks stay monospace.
    let source=text.replace(/^```(?:text)?\s*\n([\s\S]*?)^```/gm,(block,body)=>{
      const rows=body.trim().split('\n').map(r=>r.trim().split(/\s+/));
      if(rows.length<2||rows[0].length<2||!rows.every(r=>r.length===rows[0].length&&r.every(v=>/^-?\d+(?:[.,]\d+)?$/.test(v))))return block;
      return '\n$$\\begin{bmatrix}'+rows.map(r=>r.join(' & ')).join(' \\\\ ')+'\\end{bmatrix}$$\n';
    });
    const slots=[];
    const token=/```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~|`[^`\n]+`|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$])*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
    source=source.replace(token,chunk=>{
      if(chunk.startsWith('`')||chunk.startsWith('~'))return chunk;
      const display=chunk.startsWith('$$')||chunk.startsWith('\\['),width=chunk.startsWith('$')?(display?2:1):2;
      const tex=chunk.slice(width,-width);
      let html;
      try{html=katex.renderToString(tex,{displayMode:display,throwOnError:true,strict:'ignore',trust:false,maxExpand:1000});}
      catch(error){errors.push({tex,message:error.message});html='<span class="math-fallback">'+escape(chunk)+'</span>';}
      return 'TIIKMATHSLOT'+(slots.push(html)-1)+'END';
    });
    source=source.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'');
    source=source.replace(/!\[\[([^\]]+)\]\]/g,(_,path)=>'![Иллюстрация из материалов](assets/'+(path.includes('Иллюстрации')?'slides':'tasks')+'/'+encodeURIComponent(path.split('/').pop())+')');
    source=source.replace(/\[\[([^\]]+)\]\]/g,'$1');
    return marked.parse(source,{breaks:false,gfm:true}).replace(/TIIKMATHSLOT(\d+)END/g,(_,i)=>slots[Number(i)]);
  }
  const api={render};if(typeof module!=='undefined')module.exports=api;else root.TIIK_FORMAT=api;
})(typeof window!=='undefined'?window:globalThis);
