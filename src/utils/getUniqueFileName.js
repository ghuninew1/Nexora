function getUniqueFileName(name, existingNames) {
    const names = new Set(existingNames);

    if (!names.has(name)) {
        return name;
    }

    const lastDotIndex = name.lastIndexOf(".");
    const hasExtension = lastDotIndex > 0;

    const baseName = hasExtension ? name.slice(0, lastDotIndex) : name;

    const extension = hasExtension ? name.slice(lastDotIndex) : "";

    let counter = 1;
    let uniqueName = `${baseName} (${counter})${extension}`;

    while (names.has(uniqueName)) {
        counter += 1;
        uniqueName = `${baseName} (${counter})${extension}`;
    }

    return uniqueName;
}

export default getUniqueFileName;
