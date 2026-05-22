# NCDPI Data Visualization Style Guide — public site

This repository holds the **built** static site for the NCDPI Data Visualization
Style Guide & Chart Chooser. GitHub Pages serves it from the `main` branch:

**https://abax70.github.io/ncdpi-data-visualization-public/**

## Don't edit here

These files are generated. The **source of truth** is the private
`NCDPI-Data-Visualization` repo (in `site/`). To update the live site, run from
that repo:

```bash
bash tools/deploy-public.sh
```

That renders the Quarto site and pushes the built output here.
