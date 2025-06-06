export function validateLabFull(localLab, { imageInputType, docInputType }) {
    const errors = {};
    const urlRegex = /^(ftp|http|https):\/\/[^ "]+$/;
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
    const imageExtensionRegex = /\.(jpeg|jpg|gif|png|webp|svg|bmp|tiff|tif)$/i;
    const pdfExtensionRegex = /\.pdf$/i;

    if (!localLab.name?.trim()) errors.name = 'Lab name is required';
    if (!localLab.category?.trim()) errors.category = 'Category is required';
    if (!localLab.description?.trim()) errors.description = 'Description is required';

    if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
        errors.price = 'Price is required';
    } else {
        const priceNum = parseFloat(localLab.price);
        if (isNaN(priceNum) || priceNum < 0) {
            errors.price = 'Price must be a positive number or zero';
        }
    }

    if (!localLab.auth?.trim()) {
        errors.auth = 'Authentication URL is required';
    } else if (!urlRegex.test(localLab.auth)) {
        errors.auth = 'Invalid Authentication URL format';
    }

    if (!localLab.accessURI?.trim()) {
        errors.accessURI = 'Access URI is required';
    } else if (!urlRegex.test(localLab.accessURI)) {
        errors.accessURI = 'Invalid Access URI format';
    }

    if (!localLab.accessKey?.trim()) errors.accessKey = 'Access Key is required';

    if (!localLab.opens?.trim()) {
        errors.opens = 'Opening date is required';
    } else if (!dateRegex.test(localLab.opens)) {
        errors.opens = 'Invalid opening date format (must be MM/DD/YYYY)';
    }

    if (!localLab.closes?.trim()) {
        errors.closes = 'Closing date is required';
    } else if (!dateRegex.test(localLab.closes)) {
        errors.closes = 'Invalid closing date format (must be MM/DD/YYYY)';
    }

    if (!localLab.timeSlots || localLab.timeSlots.length === 0 ||
        localLab.timeSlots.every(slot => isNaN(Number(slot)) || Number(slot) <= 0)) {
        errors.timeSlots = 'At least one valid time slot (positive number) must be selected';
    }

    if (!localLab.keywords || localLab.keywords.length === 0 || localLab.keywords.every(k => !k.trim())) {
        errors.keywords = 'At least one keyword must be added';
    }

    // Date comparison
    if (!errors.opens && !errors.closes &&
        localLab.opens?.trim() && localLab.closes?.trim()) {
        const opensDate = new Date(localLab.opens);
        const closesDate = new Date(localLab.closes);
        if (closesDate.getTime() < opensDate.getTime()) {
            errors.closes = 'Closing date must be after or equal to opening date';
        }
    }

    // Image and Document link validations
    if (imageInputType === 'link' && Array.isArray(localLab.images)) {
        localLab.images.forEach((imageUrl) => {
            if (imageUrl.trim() && !imageExtensionRegex.test(imageUrl.trim())) {
                errors.images = 'Image link must end with a valid image extension (e.g., .jpg, .png)';
            }
        });
    }
    if (docInputType === 'link' && Array.isArray(localLab.docs)) {
        localLab.docs.forEach((docUrl) => {
            if (docUrl.trim() && !pdfExtensionRegex.test(docUrl.trim())) {
                errors.docs = 'Document link must end with ".pdf"';
            }
        });
    }

    return errors;
}

export function validateLabQuick(localLab) {
    const errors = {};
    const urlRegex = /^(ftp|http|https):\/\/[^ "]+$/;

    if (localLab.price === '' || localLab.price === undefined || localLab.price === null) {
        errors.price = 'Price is required';
    } else {
        const priceNum = parseFloat(localLab.price);
    if (isNaN(priceNum) || priceNum < 0) {
        errors.price = 'Price must be a positive number or zero';
    }
    }

    if (!localLab.auth?.trim()) {
        errors.auth = 'Authentication URL is required';
    } else if (!urlRegex.test(localLab.auth)) {
        errors.auth = 'Invalid Authentication URL format';
    }

    if (!localLab.accessURI?.trim()) {
        errors.accessURI = 'Access URI is required';
    } else if (!urlRegex.test(localLab.accessURI)) {
        errors.accessURI = 'Invalid Access URI format';
    }

    if (!localLab.accessKey?.trim()) errors.accessKey = 'Access Key is required';

    if (!localLab.uri?.trim()) {
        errors.uri = 'Lab Data URL is required';
    } else {
        const isExternalUrlAttempt = localLab.uri.startsWith('http://') ||
            localLab.uri.startsWith('https://') ||
            localLab.uri.startsWith('ftp://');
        if (isExternalUrlAttempt) {
            if (!urlRegex.test(localLab.uri)) {
                errors.uri = 'Invalid external URI format. Must be a valid URL starting with http(s):// or ftp://';
            }
        } else {
            errors.uri = 'It must be an external URL';
        }
    }

    return errors;
}