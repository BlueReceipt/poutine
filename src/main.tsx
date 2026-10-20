import { render } from 'preact';
import { App } from './ui/App.tsx';
import { repairStylesWhenLoaded } from './ui/restyle.ts';
import { chooseLanguage, chosenLanguage } from './ui/settings.ts';
import { phoneLanguage, stringsFor, type Language } from './ui/strings.ts';
import './ui/fonts.css';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Poutine: the #app element is missing from index.html.');
}

const app: HTMLElement = root;

/** The app in the language chosen in the secret menu, else the phone's; chosen again at once. */
const show = (language: Language): void => {
  const strings = stringsFor(language);
  document.documentElement.lang = language;
  document.title = strings.appName;
  render(
    <App
      strings={strings}
      onLanguage={(choice) => {
        chooseLanguage(choice);
        show(choice ?? phoneLanguage(navigator.languages));
      }}
    />,
    app,
  );
};
show(chosenLanguage() ?? phoneLanguage(navigator.languages));
repairStylesWhenLoaded();
