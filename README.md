# vente-de-poulet

Application web simple pour **créer, enregistrer et imprimer des factures**.

## Fonctionnalités

- Informations de l'émetteur (vendeur) et du client
- Numéro de facture automatique (`FAC-AAAA-001`, modifiable), date d'émission et d'échéance
- Articles : description, quantité, prix unitaire, montant calculé automatiquement
- Remise (%) et TVA (%) avec calcul du total en direct
- Aperçu de la facture mis en forme
- Enregistrement local (dans le navigateur), liste des factures, ouverture, duplication et suppression
- Impression ou export PDF via la fonction d'impression du navigateur (Ctrl+P → « Enregistrer au format PDF »)

## Utilisation

Aucune installation n'est nécessaire. Ouvrez simplement `index.html` dans votre navigateur,
ou lancez un petit serveur local :

```bash
python3 -m http.server 8080
# puis ouvrez http://localhost:8080
```

Les factures sont stockées dans le `localStorage` du navigateur : elles restent sur cet appareil
et ce navigateur uniquement.

## Structure

- `index.html` – page principale
- `style.css` – styles de l'interface et de l'impression
- `app.js` – logique (formulaire, calculs, stockage, liste)
