(() => {
  const root = document.getElementById('journal');
  const $ = selector => document.querySelector(selector);
  const storageKey = 'seeking-light-layout-prototype-v1';
  const today = new Date();
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const todayKey = dateKey(today);
  const samples = [
    {id:'walk',date:'2026-11-07',time:'19:20',text:'晚上散步，没看手机。\n走回家时脑子没那么吵了。',sample:true},
    {id:'ordinary',date:'2026-11-07',time:'17:40',text:'洗衣服，收快递，回了一堆消息。一天就这么过去了。',sample:true},
    {id:'diagram',date:'2026-11-07',time:'14:20',text:'把说不清楚的需求画了张流程图，大家突然都懂了。\n画的时候还挺起劲。',sample:true},
    {id:'lunch',date:'2026-11-06',time:'12:40',text:'中午出去买饭，在树下坐了十分钟。\n下午好像耐心一点。',sample:true},
    {id:'mother',date:'2026-11-05',time:'20:15',text:'跟妈妈打视频。没讲工作，听她说菜园里的事。\n心里有点安定。',sample:true},
    {id:'friend',date:'2026-11-04',time:'19:10',text:'跟朋友聊她想做的小项目。把几个散着的想法连起来了，聊完还想继续。',sample:true},
    {id:'reading',date:'2026-11-02',time:'21:35',text:'把读书笔记重新排了一下，终于看懂它们的关系。',sample:true}
  ];
  const findings = {
    restore: {label:'恢复的线索',title:'你已经遇见过，让自己缓下来的时刻。',subtitle:'不必把每一天，都过成更有成果的一天。',observation:'散步、坐一会儿、听妈妈聊生活。它们不都是独处，却都让你短暂离开工作和消息的节奏。你明确写过“没那么吵”“耐心一点”“安定”，这些具体经历值得继续留意。',uncertainty:'可能是户外、休息、有人陪伴，或当天事情少了一点。三条记录还不能证明共同原因，也不代表每次都会有效。',evidence:[['walk','走回家时脑子没那么吵了。'],['lunch','下午好像耐心一点。'],['mother','心里有点安定。']],attemptTitle:'留十分钟，不处理消息。',attemptBody:'选你本来就愿意做的事：走一小圈，或找地方坐一会儿。回来只记下有没有变化。没有变化，也是一条有用的记录。'},
    interest: {label:'兴趣的线索',title:'你似乎享受，让模糊的事情变清楚。',subtitle:'先留意过程里的投入，不急着给自己下定义。',observation:'画流程、梳理朋友的想法、整理笔记。事情不同，但你几次提到起劲、还想继续，或终于看懂。这可能是一个值得继续探索的过程。',uncertainty:'也可能是解决问题、帮助到别人，或事情顺利带来的满足。三条记录不足以证明稳定偏好，更不能直接推断适合什么职业。',evidence:[['diagram','画的时候还挺起劲。'],['friend','聊完还想继续。'],['reading','终于看懂它们的关系。']],attemptTitle:'给一个想弄明白的小问题，十分钟。',attemptBody:'随便画几笔、写几句。留意自己是过程中投入，还是得到答案后才满足。不想做，也可以先放一放。'}
  };
  let saved = {notes:[],attempts:{},feedback:{},draft:''};
  let storageProblem = '';
  let persistedValue = null;
  try {
    persistedValue = localStorage.getItem(storageKey);
    const data = JSON.parse(persistedValue || 'null');
    if(data && Array.isArray(data.notes)) saved = {notes:data.notes.filter(n=>n&&typeof n.id==='string'&&typeof n.text==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(n.date)),attempts:data.attempts&&typeof data.attempts==='object'?data.attempts:{},feedback:data.feedback&&typeof data.feedback==='object'?data.feedback:{},draft:typeof data.draft==='string'?data.draft:''};
  } catch {storageProblem='未能读取本机体验稿；保存前会再次检查。';}
  let view='notes',finding='restore',opened=false,filter='all',sourceId='',focus=false;
  const input=$('#capture');input.value=saved.draft;
  const consent=$('#consent-dialog'),reflection=$('#reflection-dialog');
  // Unsubmitted reflection drafts stay in memory, isolated by finding.
  const reflectionDrafts=new Map();let reflectionFinding='';
  let historyPage=0;
  const pageSize=50;
  function resizeInput() {input.style.height='auto';input.style.height=`${Math.max(focus?360:112,input.scrollHeight)}px`;}
  const allNotes=()=>[...saved.notes,...samples].sort((a,b)=>b.date.localeCompare(a.date)||(b.time||'').localeCompare(a.time||''));
  function write(next) {
    try {const serialized=JSON.stringify(next);localStorage.setItem(storageKey,serialized);persistedValue=serialized;saved=next;return true;}
    catch {return false;}
  }
  function el(tag,className,text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function icons(){if(window.lucide)window.lucide.createIcons({attrs:{width:18,height:18}});}
  function formatDate(key){const [y,m,d]=key.split('-');return `${Number(y)!==today.getFullYear()?`${y} 年 `:''}${Number(m)} 月 ${Number(d)} 日`;}
  function entry(note,quote='',link=false,showDate=true) {
    const article=el('article',`entry${note.id===sourceId?' is-source':''}`);article.dataset.noteId=note.id;
    const meta=el('details','entry-meta');
    const stamp=el('summary','',`${showDate?`${formatDate(note.date)} `:''}${note.time||'记录'}${note.sample?' · 示例':''}`);
    stamp.title='查看记录详情';meta.append(stamp,el('p','',`${note.date} ${note.time||''}`));
    if(note.source==='flomo')meta.append(el('p','','来自 flomo'));
    if(note.attempt)meta.append(el('p','',`小尝试的回看 / ${findings[note.attempt]?.label||'自己的尝试'}`));
    const content=el('div','entry-text'),text=el('p');
    const at=quote?note.text.indexOf(quote):-1;
    if(at>=0){text.append(document.createTextNode(note.text.slice(0,at)),el('mark','',quote),document.createTextNode(note.text.slice(at+quote.length)));}else text.textContent=note.text;
    content.append(text);
    if(link){const button=el('button','source-link icon-button');button.type='button';button.setAttribute('aria-label','查看完整原文');button.title='查看完整原文';const icon=el('i');icon.setAttribute('data-lucide','arrow-up-right');icon.setAttribute('aria-hidden','true');button.append(icon);button.addEventListener('click',()=>{sourceId=note.id;filter=note.date;view='history';focus=false;const at=allNotes().filter(n=>n.date===filter).findIndex(n=>n.id===note.id);historyPage=Math.floor(Math.max(0,at)/pageSize);render();$('#history-stream').querySelector(`[data-note-id="${note.id}"]`)?.scrollIntoView({block:'center',behavior:'instant'});});content.append(button);}
    article.append(meta,content);return article;
  }
  function renderStream(target,notes) {
    target.replaceChildren();let previous='';
    for(const note of notes){if(note.date!==previous){target.append(el('h3','day-divider',formatDate(note.date)));previous=note.date;}target.append(entry(note,'',false,false));}
    if(!notes.length)target.append(el('p','empty','这一天还没有留下记录。'));
  }
  function renderCounts() {
    const all=allNotes();
    const count=(prefix)=>all.filter(n=>n.date.startsWith(prefix)&&n.date<=todayKey).length;
    $('[data-today-count]').textContent=`今天 ${count(todayKey)} 条（含示例）`;
    $('[data-count="today"]').textContent=count(todayKey);$('[data-count="month"]').textContent=count(todayKey.slice(0,7));$('[data-count="year"]').textContent=count(todayKey.slice(0,4));
    $('#record-total').textContent=`${all.length} 条（含示例）`;
    const year=today.getFullYear(),start=new Date(year,0,1);const days=Math.round((Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000);
    const counts=new Map();all.forEach(n=>counts.set(n.date,(counts.get(n.date)||0)+1));
    const heat=$('#heatmap');heat.replaceChildren();const offset=(start.getDay()+6)%7,columns=Math.ceil((offset+days)/7);heat.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;heat.style.aspectRatio=`${columns}/7`;
    for(let cell=0;cell<columns*7;cell++){const index=cell-offset,tile=el('i');if(index<0||index>=days){tile.style.visibility='hidden';}else{const date=new Date(year,0,index+1),key=dateKey(date),n=counts.get(key)||0;tile.dataset.level=String(n===0?0:n===1?1:n<4?2:n<7?3:4);tile.title=`${key} / ${n} 条`;if(key>todayKey)tile.style.visibility='hidden';}heat.append(tile);}
    heat.setAttribute('aria-label',`${year} 年每日记录条数，含虚构示例，共 ${count(String(year))} 条。颜色仅表示条数。`);
  }
  function renderFinding() {
    const data=findings[finding];$('#finding-start').hidden=opened;$('#finding-result').hidden=!opened;
    $('#finding-label').textContent=data.label;$('#finding-title').textContent=data.title;$('#finding-subtitle').textContent=data.subtitle;
    $('#finding-observation').textContent=data.observation;$('#finding-uncertainty').textContent=data.uncertainty;
    $('#experiment-title').textContent=data.attemptTitle;$('#experiment-body').textContent=data.attemptBody;
    $('#evidence-stream').replaceChildren(...data.evidence.map(([id,quote])=>entry(samples.find(n=>n.id===id),quote,true)));
    document.querySelectorAll('[data-finding]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.finding===finding)));
    const feedback=saved.feedback[finding];document.querySelectorAll('[data-feedback]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.feedback===feedback)));
    $('#feedback-status').textContent=feedback==='yes'?'已记下：有点像。':feedback==='no'?'已记下：不太对。原文不变。':'';
    const attempt=saved.attempts[finding];$('#keep-attempt').setAttribute('aria-pressed',String(attempt?.state==='keep'));$('#keep-attempt').textContent=attempt?.state==='keep'?'已留作小尝试':'留作小尝试';
    $('#reflect-attempt').hidden=attempt?.state!=='keep';$('#attempt-status').textContent=attempt?.state==='keep'?'留在这里，不设完成期限。':attempt?.state==='later'?'先放一放，这条线索仍然在。':'';
    const result=saved.notes.find(n=>n.id===attempt?.resultId);$('#attempt-result').hidden=!result;$('#attempt-result').textContent=result?`你后来记下了：\n${result.text}`:'';
  }
  function render() {
    root.classList.toggle('is-focus',focus&&view==='notes');document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==view);
    document.querySelectorAll('nav [data-view]').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    $('#save').disabled=!input.value.trim();$('#focus').setAttribute('aria-pressed',String(focus));$('#focus').setAttribute('aria-label',focus?'退出专注书写':'专注书写');$('#focus').title=focus?'退出专注书写':'专注书写';
    const all=allNotes(),history=filter==='all'?all:all.filter(n=>n.date===filter);renderStream($('#recent-stream'),all.slice(0,4));historyPage=Math.min(historyPage,Math.max(0,Math.ceil(history.length/pageSize)-1));renderStream($('#history-stream'),history.slice(historyPage*pageSize,(historyPage+1)*pageSize));
    $('#history-pager').hidden=history.length<=pageSize;$('#history-prev').disabled=historyPage===0;$('#history-next').disabled=(historyPage+1)*pageSize>=history.length;$('#history-page').textContent=`${historyPage+1} / ${Math.max(1,Math.ceil(history.length/pageSize))} 页 · 共 ${history.length} 条`;
    const dateSelect=$('#history-date');dateSelect.replaceChildren(el('option','','全部日期'));dateSelect.children[0].value='all';[...new Set(all.map(n=>n.date))].forEach(key=>{const option=el('option','',`${key}${key===todayKey?' / 今天':''}`);option.value=key;dateSelect.append(option);});dateSelect.value=filter;
    $('#source-context').textContent=sourceId?'已定位到发现引用的原文；内容没有被改写。':'';$('#back-to-finding').hidden=!sourceId;
    renderCounts();renderFinding();icons();resizeInput();
  }
  function nextNote(text,attempt='') {const now=new Date();return {id:`local-${now.getTime()}-${Math.random().toString(36).slice(2,8)}`,date:dateKey(now),time:now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}),text,...(attempt?{attempt}:{})};}
  $('[data-date-number]').textContent=`${String(today.getMonth()+1).padStart(2,'0')} / ${String(today.getDate()).padStart(2,'0')}`;
  $('[data-date-caption]').textContent=`${today.getFullYear()} · ${today.toLocaleDateString('zh-CN',{weekday:'long'})}`;
  if(storageProblem)$('#save-status').textContent=storageProblem;
  input.addEventListener('input',()=>{$('#save').disabled=!input.value.trim();resizeInput();const ok=write({...saved,draft:input.value});$('#save-status').textContent=ok?'草稿已存本机':'无法保存草稿，请保留当前页面并重试。';});
  window.addEventListener('resize',resizeInput);
  document.fonts?.ready.then(resizeInput);
  $('#capture-form').addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim())return;const next={...saved,notes:[nextNote(input.value),...saved.notes],draft:''};if(!write(next)){$('#save-status').textContent='无法保存，原文仍在输入框中。';return;}input.value='';input.style.height='';render();$('#save-status').textContent='已记下 · 仅本机';});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;sourceId='';filter='all';historyPage=0;focus=false;render();window.scrollTo({top:0,behavior:'instant'});}));
  $('.brand').addEventListener('click',event=>{event.preventDefault();view='notes';sourceId='';filter='all';focus=false;render();window.scrollTo({top:0,behavior:'instant'});});
  $('#focus').addEventListener('click',()=>{focus=!focus;render();input.focus();});
  $('#history-date').addEventListener('change',()=>{filter=$('#history-date').value;sourceId='';historyPage=0;render();});
  $('#history-prev').addEventListener('click',()=>{historyPage=Math.max(0,historyPage-1);render();window.scrollTo({top:0,behavior:'instant'});});
  $('#history-next').addEventListener('click',()=>{historyPage++;render();window.scrollTo({top:0,behavior:'instant'});});
  $('#show-consent').addEventListener('click',()=>consent.showModal());
  $('#cancel-example').addEventListener('click',()=>consent.close());
  $('#confirm-example').addEventListener('click',()=>{opened=true;consent.close();render();});
  document.querySelectorAll('[data-finding]').forEach(button=>button.addEventListener('click',()=>{finding=button.dataset.finding;render();}));
  $('#back-to-finding').addEventListener('click',()=>{view='findings';sourceId='';filter='all';render();window.scrollTo({top:0,behavior:'instant'});});
  document.querySelectorAll('[data-feedback]').forEach(button=>button.addEventListener('click',()=>{if(write({...saved,feedback:{...saved.feedback,[finding]:button.dataset.feedback}}))render();else $('#feedback-status').textContent='反馈未保存，请重试。';}));
  function keep(state){const previous=saved.attempts[finding]||{};if(write({...saved,attempts:{...saved.attempts,[finding]:{...previous,state}}}))render();else $('#attempt-status').textContent='尝试未保存，请重试。';}
  $('#keep-attempt').addEventListener('click',()=>keep('keep'));$('#defer-attempt').addEventListener('click',()=>keep('later'));
  $('#reflect-attempt').addEventListener('click',()=>{reflectionFinding=finding;$('#reflection').value=reflectionDrafts.get(reflectionFinding)||'';$('#save-reflection').disabled=!$('#reflection').value.trim();$('#reflection-context').textContent=findings[reflectionFinding].attemptTitle;$('#reflection-status').textContent='';reflection.showModal();$('#reflection').focus();});
  $('#cancel-reflection').addEventListener('click',()=>reflection.close());
  $('#reflection').addEventListener('input',()=>{if(reflectionFinding)reflectionDrafts.set(reflectionFinding,$('#reflection').value);$('#save-reflection').disabled=!$('#reflection').value.trim();});
  $('#reflection-form').addEventListener('submit',event=>{event.preventDefault();const text=$('#reflection').value;if(!text.trim()||!reflectionFinding)return;reflectionDrafts.set(reflectionFinding,text);const note=nextNote(text,reflectionFinding);const next={...saved,notes:[note,...saved.notes],attempts:{...saved.attempts,[reflectionFinding]:{state:'keep',resultId:note.id}}};if(!write(next)){$('#reflection-status').textContent='没有保存成功，感受仍在输入框中。';return;}reflectionDrafts.delete(reflectionFinding);$('#reflection').value='';$('#save-reflection').disabled=true;reflection.close();render();$('#attempt-status').textContent='已记下感受，也留在回看里。';});
  const importDialog=$('#import-dialog');
  let importVersion=0,importPlan=null,importBusy=false;
  function updateImportButton(){ $('#confirm-import').disabled=importBusy||!importPlan?.notes.length||(!$('#import-ack-label').hidden&&!$('#import-ack').checked); }
  function resetImport(){importVersion++;importPlan=null;importBusy=false;$('#import-file').value='';$('#import-preview').hidden=true;$('#import-status').textContent='';$('#import-ack').checked=false;updateImportButton();}
  $('#open-import').addEventListener('click',()=>{resetImport();importDialog.showModal();});
  $('#cancel-import').addEventListener('click',()=>importDialog.close());
  importDialog.addEventListener('close',resetImport);
  $('#import-ack').addEventListener('change',updateImportButton);
  $('#import-file').addEventListener('change',async()=>{
    const version=++importVersion,api=window.SeekingLightImport,files=Array.from($('#import-file').files||[]);
    importPlan=null;importBusy=true;$('#import-preview').hidden=true;$('#import-ack').checked=false;$('#import-status').textContent='正在读取文件…';updateImportButton();
    try {
      if(!files.length){$('#import-status').textContent='';return;}
      if(!api)throw new Error('导入组件没有加载，请刷新页面后重试。');
      if(files.some(file=>!/\.html?$/i.test(file.name)))throw new Error('请选择 HTML 文件；ZIP 需要先解压。');
      if(files.reduce((sum,file)=>sum+file.size,0)>api.MAX_BYTES)throw new Error('文件总大小超过 20 MB，请在 flomo 按日期分批导出。');
      const result={records:[],total:0,invalid:0,empty:0,media:0};
      for(const file of files){
        const html=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
        if(version!==importVersion)return;
        const parsed=api.parseHTML(html,document);
        for(const field of ['total','invalid','empty','media'])result[field]+=parsed[field];
        result.records.push(...parsed.records);
        if(result.total>40000)throw new Error('记录超过 40,000 条，请分批导出。');
      }
      const plan=api.plan(result.records,saved.notes);
      const notes=await api.identify(plan.notes,window.crypto);
      if(version!==importVersion)return;
      importPlan={notes};
      const dates=result.records.map(n=>n.date).sort();
      $('#import-summary').textContent=`找到 ${result.total} 条 · 新增 ${notes.length} 条 · 重复 ${plan.duplicates} 条${dates.length?`\n${dates[0]} 至 ${dates[dates.length-1]}`:''}`;
      $('#import-warning').textContent=`不会覆盖已有记录。重复按原日期、时间和相同文字判断。${result.invalid?` ${result.invalid} 条缺少内容或有效时间，不能导入。`:''}${result.empty?` ${result.empty} 条没有可导入的文字，不能导入。`:''}${result.media?` ${result.media} 条含图片或附件，仅导入文字。`:''}`;
      $('#import-ack-label').hidden=!(result.invalid||result.empty||result.media);
      $('#import-examples').replaceChildren(...notes.slice(0,3).map(note=>{const article=el('article');article.append(el('time','',`${note.date} ${note.time}`),el('p','',note.text.length>280?`${note.text.slice(0,280)}…`:note.text));return article;}));
      $('#import-preview').hidden=false;$('#import-status').textContent=notes.length?'尚未写入，确认后才会导入。':'没有新增记录。';
    } catch(error){if(version===importVersion){importPlan=null;$('#import-status').textContent=error.name==='TypeError'?'文件编码无法读取，请重新导出 UTF-8 HTML。':error.message||'无法读取文件，请重新导出后再试。';}}
    finally {if(version===importVersion){importBusy=false;updateImportButton();}}
  });
  $('#confirm-import').addEventListener('click',()=>{
    if($('#confirm-import').disabled||!importPlan)return;
    try {
      const current=localStorage.getItem(storageKey);
      if(storageProblem||current!==persistedValue)throw new Error('本机记录发生变化或未能读取，请关闭导入并刷新页面后重试。');
      if(current){const data=JSON.parse(current);if(!data||!Array.isArray(data.notes)||data.notes.length!==saved.notes.length)throw new Error('已有记录格式异常，未导入。请保留当前记录和导出文件。');}
      const notes=window.SeekingLightImport.plan(importPlan.notes,saved.notes).notes;
      if(!notes.length){$('#import-status').textContent='这些记录已经导入，无需重复操作。';importPlan=null;updateImportButton();return;}
      if(!write({...saved,notes:[...notes,...saved.notes]}))throw new Error('浏览器空间不足或无法保存，整批未导入，原记录没有改变。请保留导出文件。');
      importDialog.close();view='history';filter='all';sourceId='';historyPage=0;focus=false;render();$('#source-context').textContent=`已从 flomo 导入 ${notes.length} 条，原日期和文字已保留；没有发送给 AI。`;
    } catch(error){$('#import-status').textContent=error.message||'没有导入，原记录未改变。';}
  });
  render();
})();
