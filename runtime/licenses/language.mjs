import {getLocale,setLocale,localizeStatic} from '../shared/i18n.mjs';
function change(locale) {
  setLocale(locale); document.documentElement.lang=getLocale(); localizeStatic();
  for (const [id,value] of [['language-en','en-US'],['language-zh','zh-CN']]) document.getElementById(id).setAttribute('aria-pressed',String(value===getLocale()));
}
document.getElementById('language-en').addEventListener('click',()=>change('en-US'));
document.getElementById('language-zh').addEventListener('click',()=>change('zh-CN'));
change(new URL(location.href).searchParams.get('lang'));
