import { render } from 'preact';
import { App } from './ui/App.tsx';
import { repairStylesWhenLoaded } from './ui/restyle.ts';
import { phoneLanguage, stringsFor } from './ui/strings.ts';
import './ui/fonts.css';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Poutine: the #app element is missing from index.html.');
}

const language = phoneLanguage(navigator.languages);
const strings = stringsFor(language);
document.documentElement.lang = language;
document.title = strings.appName;

render(<App strings={strings} />, root);
repairStylesWhenLoaded();
