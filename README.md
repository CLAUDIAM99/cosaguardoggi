# Stasera cosa guardo?

Piattaforma stile Tinder per scegliere il film o il cartone da vedere: swipa a destra (like) o a sinistra (skip), poi consulta i match.

## Come usare

1. Apri `movie-picker/index.html` nel browser (o da 360step se hai un link in nav).
2. **Configura l'API TMDB** (gratuita):
   - Registrati su [themoviedb.org](https://www.themoviedb.org) e in [Impostazioni → API](https://www.themoviedb.org/settings/api) richiedi una API Key.
   - Apri `movie-picker/config.js` e assegna la chiave a `tmdbApiKey`.
3. Scegli una modalità:
   - **Per stile o genere**: seleziona uno o più generi (Commedia, Animazione, ecc.) e clicca "Inizia a swipare".
   - **Simile a un film**: scrivi un film che ti è piaciuto, selezionalo dai suggerimenti e avvia; vedrai film simili in stile Tinder.
4. Swipa a destra (♥) per i film che ti piacciono, a sinistra (✕) per saltare. Puoi usare anche i pulsanti.
5. Clicca **Vedi i miei match** per la lista dei "like" e scegliere cosa guardare stasera.

## File

- `index.html` – Schermate: scelta modalità, swipe, match.
- `style.css` – Stile Tinder (card, swipe, gradienti).
- `app.js` – Logica TMDB (discover, search, similar), swipe touch/mouse, like/skip.
- `config.js` – Inserisci qui la tua `tmdbApiKey`.
