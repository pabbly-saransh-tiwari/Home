addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const CHECK_API_KEY = '3be0fa73-bd3b-4953-a5f7-3ebdfae0feea';
  const requestHeaders = request.headers;
  const incomingApiKey = requestHeaders.get('pabbly_api_key');
  let fileExtension = null;

  if (incomingApiKey !== CHECK_API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  let requestBody;
  try {
    const requestText = await request.text();
    requestBody = JSON.parse(requestText);
  } catch (e) {
    return new Response('Invalid JSON body error', { status: 400 });
  }

  const {
    file_url,
    endpoint,
    method = 'POST',
    headers_to_forward,
    body: body_params,
    file_key = 'file',
  } = requestBody;

  if (!file_url || !endpoint) {
    return new Response('Missing required fields in request body', { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const endpointUrl = new URL(endpoint);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    endpointUrl.searchParams.append(key, value);
  }

  try {
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return new Response('Failed to fetch the file', { status: 500 });
    }

    // Simplified mimeTypes mapping
    const mimeTypes = {
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/rtf': 'rtf',
      'text/html': 'html',
      'text/css': 'css',
      'application/javascript': 'js',
      'application/json': 'json',
      'application/xml': 'xml',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/tiff': 'tiff',
      'image/x-icon': 'ico',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/zip': 'zip',
      'application/octet-stream': 'bin'
    };

    let contentType = fileResponse.headers.get('Content-Type');
    if (contentType) {
      contentType = contentType.split(';')[0].trim();
    }

    if (
      !contentType ||
      contentType === 'application/octet-stream' ||
      contentType === 'application/binary'
    ) {
      const contentDisposition = fileResponse.headers.get('Content-Disposition');

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i
        );
        if (filenameMatch && filenameMatch[1]) {
          let filename = filenameMatch[1].replace(/['"]/g, '');
          fileExtension = filename.split('.').pop().toLowerCase();
        }
      }
      if (!fileExtension) {
        const urlObj = new URL(file_url);
        const urlPath = urlObj.pathname;
        fileExtension = urlPath.split('.').pop().toLowerCase();

        if (!fileExtension || fileExtension === urlPath.toLowerCase()) {
          fileExtension = '';
          const possibleParams = ['exportFormat', 'format', 'ext'];
          for (const param of possibleParams) {
            if (urlObj.searchParams.has(param)) {
              fileExtension = urlObj.searchParams.get(param).toLowerCase();
              break;
            }
          }
        }
      }
    } else {
      // Use normalized contentType to get fileExtension
      fileExtension = mimeTypes[contentType];
    }

    if (!fileExtension) {
      const urlObj = new URL(file_url);
      const urlPath = urlObj.pathname;
      fileExtension = urlPath.split('.').pop().toLowerCase() || '';

      if (!fileExtension || fileExtension === urlPath.toLowerCase()) {
        const contentDisposition = fileResponse.headers.get('Content-Disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(
            /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i
          );
          if (filenameMatch && filenameMatch[1]) {
            let filename = filenameMatch[1].replace(/['"]/g, '');
            fileExtension = filename.split('.').pop().toLowerCase();
          }
        }
      }
    }

    const finalFilename = `${file_key}${fileExtension ? `.${fileExtension}` : ''}`;

    const fileArrayBuffer = await fileResponse.arrayBuffer();

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);
    const formDataParts = [];

    // Recursive function to build form data parts
    function buildFormDataParts(key, value) {
      let parts = [];
      if (value === null || value === undefined) {
        return parts;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            for (const [nestedKey, nestedValue] of Object.entries(item)) {
              const arrayKey = `${key}[${index}][${nestedKey}]`;
              parts = parts.concat(buildFormDataParts(arrayKey, nestedValue));
            }
          } else {
            const arrayKey = `${key}[${index}]`;
            parts = parts.concat(buildFormDataParts(arrayKey, item));
          }
        });
      } else if (typeof value === 'object') {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          const objectKey = `${key}[${nestedKey}]`;
          parts = parts.concat(buildFormDataParts(objectKey, nestedValue));
        }
      } else {
        parts.push(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
            `${value}\r\n`
        );
      }
      return parts;
    }

    if (body_params) {
      for (const [key, value] of Object.entries(body_params)) {
        const parts = buildFormDataParts(key, value);
        formDataParts.push(...parts);
      }
    }

    // Set the filename with extension in the Content-Disposition header
    formDataParts.push(
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="${file_key}"; filename="${finalFilename}"\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
      new Uint8Array(fileArrayBuffer),
      `\r\n`
    );

    formDataParts.push(`--${boundary}--\r\n`);

    let totalLength = formDataParts.reduce((acc, part) => {
      const partLength =
        part instanceof Uint8Array ? part.length : new TextEncoder().encode(part).length;
      return acc + partLength;
    }, 0);

    let body = new Uint8Array(totalLength);
    let offset = 0;

    formDataParts.forEach(part => {
      if (part instanceof Uint8Array) {
        body.set(part, offset);
        offset += part.length;
      } else {
        const encodedPart = new TextEncoder().encode(part);
        body.set(encodedPart, offset);
        offset += encodedPart.length;
      }
    });

    const fetchHeaders = new Headers();
    fetchHeaders.set('Content-Type', `multipart/form-data; boundary=${boundary}`);

    if (headers_to_forward) {
      let headerKeys = [];
      if (Array.isArray(headers_to_forward)) {
        headerKeys = headers_to_forward;
      } else if (typeof headers_to_forward === 'string') {
        headerKeys = headers_to_forward.split(',').map(s => s.trim());
      }

      for (const key of headerKeys) {
        const headerValue = requestHeaders.get(key);
        if (headerValue) {
          fetchHeaders.set(key, headerValue);
        } else {
          return new Response(`Header '${key}' not found in the request`, { status: 400 });
        }
      }
    }

    const response = await fetch(endpointUrl.toString(), {
      method,
      headers: fetchHeaders,
      body,
    });

    const responseBody = await response.text();
    return new Response(responseBody, { status: response.status, headers: response.headers });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
