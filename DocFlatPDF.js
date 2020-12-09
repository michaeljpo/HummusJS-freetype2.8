const hummus = require('./binding/hummus');
const _ = require('lodash');

function startModifiedDictionary(handles, originalDict, excludedKeys) {
  const originalDictJs = originalDict.toJSObject();
  const newDict = handles.objectsContext.startDictionary();

  Object.getOwnPropertyNames(originalDictJs).forEach(function(
    element,
    index,
    array
  ) {
    if (!excludedKeys[element]) {
      newDict.writeKey(element);
      handles.copyingContext.copyDirectObjectAsIs(originalDictJs[element]);
    }
  });

  return newDict;
}

function collectWidgetAnnotations(reader, pageDictionary) {
  // look for widget annotations, which are the form fields presentation on the page. we need to turn
  // them to simple overlays of appearance graphics, instead of the original interactive object.
  // hance - remove the annotation, and replace with graphic overlay of placing its appearance form
  const widgetAnnotatons = [];
  if (pageDictionary.exists('Annots')) {
    const annotationsArray = reader
      .queryDictionaryObject(pageDictionary, 'Annots')
      .toPDFArray();

    for (let i = 0; i < annotationsArray.getLength(); ++i) {
      let appearanceObjectId;

      if (!reader.queryArrayObject(annotationsArray, i)) continue;
      const annotationObject = reader
        .queryArrayObject(annotationsArray, i)
        .toPDFDictionary();
      const isWidget =
        annotationObject.queryObject('Subtype').toString() == 'Widget';
      if (isWidget) {
        // find the appearance xobject id that represents this annoation appearance
        if (!reader.queryDictionaryObject(annotationObject, 'AP')) continue;
        const apDictionary = reader
          .queryDictionaryObject(annotationObject, 'AP')
          .toPDFDictionary();
        const nAppearances = reader.queryDictionaryObject(apDictionary, 'N');
        if (nAppearances.getType() === hummus.ePDFObjectDictionary) {
          const nAppearancesDict = nAppearances.toPDFDictionary().toJSObject();

          if (Object.keys(nAppearancesDict).length === 1) {
            // if one appearance in nAppearances, than it is the appearance stream to use. keep it
            appearanceObjectId = nAppearancesDict[
              Object.keys(nAppearancesDict)[0]
            ]
              .toPDFIndirectObjectReference()
              .getObjectID();
          } else {
            // otherwise, consult AS entry for the one to take
            if (annotationObject.exists('AS')) {
              const appearanceName = annotationObject
                .queryObject('AS')
                .toString();
              appearanceObjectId = nAppearancesDict[appearanceName]
                .toPDFIndirectObjectReference()
                .getObjectID();
            }
          }
        } else {
          // stream, this means a single appearance. record its object Id
          appearanceObjectId = apDictionary
            .queryObject('N')
            .toPDFIndirectObjectReference()
            .getObjectID();
        }

        if (appearanceObjectId)
          widgetAnnotatons.push({
            id: appearanceObjectId,
            name: toText(annotationObject.queryObject('T')),
            rect: _.map(
              reader
                .queryDictionaryObject(annotationObject, 'Rect')
                .toPDFArray()
                .toJSArray(),
              function(item) {
                return item.toNumber();
              }
            )
          });
      }
    }
  }

  return widgetAnnotatons;
}

function writeNewXObjectsWithPrefix(xobjects, prefix, widgetAnnoations) {
  const results = [];
  widgetAnnoations.forEach(function(item, index) {
    const formObjectName = `${prefix}_${index}`;
    xobjects.writeKey(formObjectName);
    xobjects.writeObjectReferenceValue(item.id);
    results.push({
      name: formObjectName,
      field: item.name,
      rect: item.rect
    });
  });
  return results;
}

function writeNewXObjectDict(resources, objectsContext, widgetAnnoations) {
  let results = [];
  resources.writeKey('XObject');
  const xobjects = objectsContext.startDictionary();
  results = writeNewXObjectsWithPrefix(xobjects, 'myForm', widgetAnnoations);
  objectsContext.endDictionary(xobjects);
  return results;
}

function writeNewResourcesDictionary(objectsContext, widgetAnnoations) {
  const resources = objectsContext.startDictionary();
  const results = writeNewXObjectDict(
    resources,
    objectsContext,
    widgetAnnoations
  );
  objectsContext.endDictionary(resources);

  return results;
}

function findInheritedResources(reader, dict) {
  if (dict.exists('Resources')) {
    return reader.queryDictionaryObject(dict, 'Resources').toPDFDictionary();
  }
  const parentDict = dict.exists('Parent')
    ? reader.queryDictionaryObject(dict, 'Parent').toPDFDictionary()
    : null;
  if (!parentDict) return null;
  return findInheritedResources(reader, parentDict);
}

function getDifferentChar(inCharCode) {
  // numerals
  if (inCharCode >= 0x30 && inCharCode <= 0x38) return inCharCode + 1;
  if (inCharCode == 0x39) return 0x30;

  // lowercase
  if (inCharCode >= 0x61 && inCharCode <= 0x79) return inCharCode + 1;
  if (inCharCode == 0x7a) return 0x61;

  // uppercase
  if (inCharCode >= 0x41 && inCharCode <= 0x59) return inCharCode + 1;
  if (inCharCode == 0x5a) return 0x41;

  return 0x41;
}

function writeModifiedResourcesDict(handles, resources, widgetAnnoations) {
  let results;
  const { objectsContext } = handles;
  const { reader } = handles;
  const { copyingContext } = handles;

  const modifiedResourcesDict = startModifiedDictionary(handles, resources, {
    XObject: -1
  });

  if (resources.exists('XObject')) {
    modifiedResourcesDict.writeKey('XObject');
    const xobjects = objectsContext.startDictionary();
    const existingXObjectsDict = reader
      .queryDictionaryObject(resources, 'XObject')
      .toPDFDictionary()
      .toJSObject();
    // copy existing names, while at it creating a new different prefix name for new xobjects
    let i = 0;
    let newObjectPrefix = '';
    Object.getOwnPropertyNames(existingXObjectsDict).forEach(function(name) {
      xobjects.writeKey(name);
      copyingContext.copyDirectObjectAsIs(existingXObjectsDict[name]);
      newObjectPrefix += String.fromCharCode(
        getDifferentChar(name.length >= i + 1 ? name.charCodeAt(i) : 0x39)
      );
      ++i;
    });

    results = writeNewXObjectsWithPrefix(
      xobjects,
      newObjectPrefix,
      widgetAnnoations
    );
    objectsContext.endDictionary(xobjects);
  } else {
    // results = writeNewXObjectDict(resources,objectsContext,widgetAnnoations);
    results = writeNewXObjectDict(
      modifiedResourcesDict,
      objectsContext,
      widgetAnnoations
    );
  }
  objectsContext.endDictionary(modifiedResourcesDict);
  return results;
}

function writeToStreamCxt(streamCxt, str) {
  let bytes = [];
  for (let i = 0; i < str.length; ++i) {
    const code = str.charCodeAt(i);
    bytes = bytes.concat([code]);
  }
  streamCxt.getWriteStream().write(bytes);
}

function lockWidgetAnnotationsForPage(
  handles,
  pageObjectId,
  pageDictionary,
  widgetAnnotatons
) {
  if (widgetAnnotatons.length == 0)
    // nothing much to do here without widget annoations. so let's keep this for "at least one"
    return;

  const { objectsContext } = handles;
  const { copyingContext } = handles;
  const { reader } = handles;

  // rewrite page object. we'll need to remove the widget annotations, create new content overlay
  // and add annotation forms to the page resources dict...easy
  objectsContext.startModifiedIndirectObject(pageObjectId);
  const modifiedPageDictionary = startModifiedDictionary(
    handles,
    pageDictionary,
    {
      Annots: -1,
      Resources: -1,
      Contents: -1
    }
  );

  // 1. rewrite the annots entry, without the widget annotations (don't mind if it's empty now)
  modifiedPageDictionary.writeKey('Annots');
  objectsContext.startArray();
  const annotationsArray = reader
    .queryDictionaryObject(pageDictionary, 'Annots')
    .toPDFArray();
  for (var i = 0; i < annotationsArray.getLength(); ++i) {
    const annotationObject = reader
      .queryArrayObject(annotationsArray, i)
      .toPDFDictionary();
    const isWidget =
      annotationObject.queryObject('Subtype').toString() == 'Widget';
    if (!isWidget) {
      copyingContext.copyDirectObjectAsIs(annotationObject);
    }
  }
  objectsContext.endArray();
  objectsContext.endLine();

  // 2. write new contents entry, with a new overlay entry

  // Content IDs that we'll use to introduce new overlay (the pre one is just to protect the matrix)
  const preContent = objectsContext.allocateNewObjectID();
  const postContent = objectsContext.allocateNewObjectID();

  const existingContentsStreamsIds = [];
  if (pageDictionary.exists('Contents')) {
    const contents = reader.queryDictionaryObject(pageDictionary, 'Contents');
    if (contents.getType() === hummus.ePDFObjectStream) {
      // single content stream case
      existingContentsStreamsIds.push(
        pageDictionary
          .queryObject('Contents')
          .toPDFIndirectObjectReference()
          .getObjectID()
      );
    } else if (contents.getType() === hummus.ePDFObjectArray) {
      // multiple content streams. get all object ids
      const contentsArray = reader
        .queryDictionaryObject(pageDictionary, 'Contents')
        .toPDFArray();
      for (var i = 0; i < contentsArray.getLength(); ++i) {
        existingContentsStreamsIds.push(
          contentsArray
            .queryObject(i)
            .toPDFIndirectObjectReference()
            .getObjectID()
        );
      }
    }
  }
  // got existing content streams IDs, let's re-write, adding pre-stream, and post-stream
  modifiedPageDictionary.writeKey('Contents');
  objectsContext.startArray();
  objectsContext.writeIndirectObjectReference(preContent);
  existingContentsStreamsIds.forEach(function(item) {
    objectsContext.writeIndirectObjectReference(item);
  });
  objectsContext.writeIndirectObjectReference(postContent);
  objectsContext.endArray();
  objectsContext.endLine();

  // 3. write new resources dict with the new resources. this part is a bit annoying with all the various options
  modifiedPageDictionary.writeKey('Resources');
  if (pageDictionary.exists('Resources')) {
    widgetAnnotatons = writeModifiedResourcesDict(
      handles,
      reader
        .queryDictionaryObject(pageDictionary, 'Resources')
        .toPDFDictionary(),
      widgetAnnotatons
    );
  } else {
    const parentDict = pageDictionary.exists('Parent')
      ? reader.queryDictionaryObject(pageDictionary, 'Parent').toPDFDictionary()
      : null;
    if (!parentDict) {
      widgetAnnotatons = writeNewResourcesDictionary(
        objectsContext,
        widgetAnnotatons
      );
    } else {
      const inheritedResources = findInheritedResources(reader, parentDict);
      if (!inheritedResources) {
        widgetAnnotatons = writeNewResourcesDictionary(
          objectsContext,
          widgetAnnotatons
        );
      } else {
        widgetAnnotatons = writeModifiedResourcesDict(
          handles,
          inheritedResources,
          widgetAnnotatons
        );
      }
    }
  }

  objectsContext.endDictionary(modifiedPageDictionary).endIndirectObject();

  // now write the new overlay placing all the widget annoation forms

  // first write stream with just a save, to encapsulate what unwanted graphic state changes
  // the existing content has
  objectsContext.startNewIndirectObject(preContent);
  const preStreamCxt = objectsContext.startPDFStream();
  writeToStreamCxt(preStreamCxt, 'q\r\n');
  objectsContext.endPDFStream(preStreamCxt);
  objectsContext.endIndirectObject();

  // now the 2nd one, iterate the widget annotations, write the forms
  objectsContext.startNewIndirectObject(postContent);
  const postStreamCxt = objectsContext.startPDFStream();
  writeToStreamCxt(postStreamCxt, 'Q\r\n');

  // iterate widget annotations and write their placement code
  widgetAnnotatons.forEach(function(item) {
    writeToStreamCxt(postStreamCxt, 'q\r\n');
    if (item.field[0] === 'c')
      if (item.field.substring(4) === '[2]')
        writeToStreamCxt(
          postStreamCxt,
          `1 0 0 1 ${item.rect[0]} ${item.rect[1]} cm\r\n`
        );
      else null;
    else
      writeToStreamCxt(
        postStreamCxt,
        `1 0 0 1 ${item.rect[0] + 3} ${item.rect[1] + 5} cm\r\n`
      );
    writeToStreamCxt(postStreamCxt, `/${item.name} Do\r\n`);
    writeToStreamCxt(postStreamCxt, 'Q\r\n');
  });
  objectsContext.endPDFStream(postStreamCxt);
  objectsContext.endIndirectObject();
}

const BUFFER_SIZE = 10000;

function convertWidgetAnnotationsToForm(handles, widgetAnnoations) {
  const { reader } = handles;
  const { objectsContext } = handles;

  // just make sure that the widget annotation can qualify as a form xobject (just that it has type and subtype...sometimes they don't)
  widgetAnnoations.forEach(function(item) {
    const xobjectStream = reader.parseNewObject(item.id).toPDFStream();
    const widgetDictionary = xobjectStream.getDictionary();
    if (
      !widgetDictionary.exists('Subtype') ||
      !widgetDictionary.exists('Type')
    ) {
      objectsContext.startModifiedIndirectObject(item.id);
      const dict = startModifiedDictionary(handles, widgetDictionary, {
        Subtype: -1,
        Type: -1,
        Length: -1,
        Filter: -1,
        DecodeParams: -1
      });
      dict.writeKey('Type');
      dict.writeNameValue('XObject');
      dict.writeKey('Subtype');
      dict.writeNameValue('Form');
      const streamCxt = objectsContext.startPDFStream(dict);
      const streamWriteStream = streamCxt.getWriteStream();
      const readStream = reader.startReadingFromStream(xobjectStream);
      while (readStream.notEnded()) {
        const readData = readStream.read(BUFFER_SIZE);
        streamWriteStream.write(readData);
      }

      objectsContext.endPDFStream(streamCxt);
      objectsContext.endIndirectObject();
    }
  });
}

function lockPages(handles) {
  const { reader } = handles;

  // iterate pages, and lock the fields on them
  for (let i = 0; i < reader.getPagesCount(); ++i) {
    const pageDictionary = reader.parsePageDictionary(i);
    const widgetAnnotatons = collectWidgetAnnotations(reader, pageDictionary);
    convertWidgetAnnotationsToForm(handles, widgetAnnotatons);
    lockWidgetAnnotationsForPage(
      handles,
      reader.getPageObjectID(i),
      pageDictionary,
      widgetAnnotatons
    );
  }
}

function removeForm(handles) {
  // rewrite catalog without the form
  const { reader } = handles;
  const { objectsContext } = handles;

  const catalogDict = reader
    .queryDictionaryObject(reader.getTrailer(), 'Root')
    .toPDFDictionary();
  const catalogObjectId = reader
    .getTrailer()
    .queryObject('Root')
    .toPDFIndirectObjectReference()
    .getObjectID();
  objectsContext.startModifiedIndirectObject(catalogObjectId);
  const modifiedCatalogDictionary = startModifiedDictionary(
    handles,
    catalogDict,
    { AcroForm: -1 }
  );
  objectsContext.endDictionary(modifiedCatalogDictionary).endIndirectObject();

  // mark form object for deletion
  const acroformInCatalog = catalogDict.exists('AcroForm')
    ? catalogDict.queryObject('AcroForm')
    : null;
  if (
    !!acroformInCatalog &&
    acroformInCatalog.getType() === hummus.ePDFObjectIndirectObjectReference
  ) {
    const acroformObjectId = acroformInCatalog
      .toPDFIndirectObjectReference()
      .getObjectID();
    objectsContext.deleteObject(acroformObjectId);
  }
}

function lockForm(writer) {
  const handles = {
    writer: writer,
    reader: writer.getModifiedFileParser(),
    copyingContext: writer.createPDFCopyingContextForModifiedFile(),
    objectsContext: writer.getObjectsContext()
  };

  lockPages(handles);
  removeForm(handles);
}

function toText(item) {
  if (item.getType() === hummus.ePDFObjectLiteralString) {
    return item.toPDFLiteralString().toText();
  }
  if (item.getType() === hummus.ePDFObjectHexString) {
    return item.toPDFHexString().toText();
  }
  return item.value;
}

module.exports = lockForm;
