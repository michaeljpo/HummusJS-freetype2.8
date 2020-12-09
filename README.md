# HummusJS (Freetype 2.8)

[![NPM version](http://img.shields.io/npm/v/hummus-freetype28.svg?style=flat)](https://www.npmjs.com/package/hummus-freetype28)

**About this package:**  
This is the same version of HummusJS package, but with freetype updated to version 2.8. [Original package](https://www.npmjs.com/package/hummus)

It also includes lodash to support FormFiller and FlatDocs methods both implemented by Galkahana. Example:

```
import hummus from 'hummus-freetype28/hummus';

const flatDoc = hummus.DocFlatPDF;
const fillForm = hummus.FormFillerPDF;
await flatDoc(writer);
```


**Original README:**  
Welcome to HummusJS.  
A Fast NodeJS Module for Creating, Parsing an Manipulating PDF Files and Streams.  
Documentation is available [here](https://github.com/galkahana/HummusJS/wiki).  
Project site is [here](http://www.pdfhummus.com).

If you are looking for a C++ Library go [here](https://github.com/galkahana/PDF-Writer).
