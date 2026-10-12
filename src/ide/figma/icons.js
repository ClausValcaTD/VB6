// Original monochrome workspace glyphs; no third-party logos or font assets.
const paths={
 pointer:'M5 3l14 9-7 1-3 7z',hand:'M8 11V5a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v5c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a1.5 1.5 0 0 1 2-2l3 2',
 frame:'M7 2v20M17 2v20M2 7h20M2 17h20',text:'M4 5V3h16v2M12 3v18M8 21h8',button:'M4 6h16v12H4zM8 12h8',input:'M3 6h18v12H3zM7 9v6M10 12h7',
 play:'M7 4l13 8-13 8z',stop:'M5 5h14v14H5z',code:'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',layers:'M12 3l10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6',
 search:'M16 16l6 6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',menu:'M4 6h16M4 12h16M4 18h16',chevron:'M8 4l8 8-8 8',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 plus:'M12 4v16M4 12h16',undo:'M8 4L3 9l5 5M3 9h10c10 0 10 12 0 12',redo:'M16 4l5 5-5 5M21 9H11C1 9 1 21 11 21',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
 left:'M4 3v18M8 7h12v4H8zM8 15h8v4H8z',center:'M12 2v20M4 6h16v4H4zM7 14h10v4H7z',right:'M20 3v18M4 7h12v4H4zM8 15h8v4H8z',top:'M3 4h18M7 8h4v12H7zM15 8h4v8h-4z',middle:'M2 12h20M6 4h4v16H6zM14 7h4v10h-4z',bottom:'M3 20h18M7 4h4v12H7zM15 8h4v8h-4z'
};
export function figmaIcon(name){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
  for(const [key,value]of Object.entries({viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  svg.classList.add('figma-icon');path.setAttribute('d',paths[name]||paths.frame);svg.append(path);return svg;
}
