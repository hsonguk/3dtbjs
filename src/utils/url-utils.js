/**
 * URL utility functions for OGC 3D Tiles
 */

/**
 * Assembles a complete URL from a root URL and relative path
 * @param {string} root - The root URL
 * @param {string} relative - The relative path
 * @returns {string} The assembled URL
 */
export function assembleURL(root, relative) {
    // Append a slash to the root URL if it doesn't already have one
    if (!root.endsWith('/')) {
        root += '/';
    }

    const rootUrl = new URL(root);
    let rootParts = rootUrl.pathname.split('/').filter((p) => p !== '');
    let relativeParts = relative.split('/').filter((p) => p !== '');

    for (let i = 1; i <= rootParts.length; i++) {
        if (i >= relativeParts.length) break;
        const rootToken = rootParts.slice(rootParts.length - i, rootParts.length).join('/');
        const relativeToken = relativeParts.slice(0, i).join('/');
        if (rootToken === relativeToken) {
            for (let j = 0; j < i; j++) {
                rootParts.pop();
            }
            break;
        }
    }

    while (relativeParts.length > 0 && relativeParts[0] === '..') {
        rootParts.pop();
        relativeParts.shift();
    }

    return `${rootUrl.protocol}//${rootUrl.host}/${[...rootParts, ...relativeParts].join('/')}`;
}

/**
 * Extracts query parameters from a URL and adds them to a params object
 * @param {string} url - The URL to extract parameters from
 * @param {Object} params - The object to add parameters to
 * @returns {string} The URL without query parameters
 */
export function extractQueryParams(url, params) {
    const urlObj = new URL(url);

    // Iterate over all the search parameters
    for (let [key, value] of urlObj.searchParams) {
        params[key] = value;
    }

    // Remove the query string
    urlObj.search = '';
    return urlObj.toString();
}

/**
 * Builds query parameter string from an object
 * @param {Object} params - The parameters object
 * @returns {string} The query parameter string
 */
export function buildQueryString(params) {
    if (!params || Object.keys(params).length === 0) {
        return '';
    }

    let props = '';
    for (let key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
            props += '&' + key + '=' + params[key];
        }
    }
    return props;
}

/**
 * Adds query parameters to a URL
 * @param {string} url - The base URL
 * @param {Object} params - The parameters to add
 * @returns {string} The URL with query parameters
 */
export function addQueryParams(url, params) {
    const queryString = buildQueryString(params);
    if (!queryString) return url;

    if (url.includes('?')) {
        return url + queryString;
    } else {
        return url + '?' + queryString.substring(1);
    }
}