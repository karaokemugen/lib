// Separated functions from files.ts without node fs dependencies that can run in a browser

export const blobToBase64 = (
	file: Blob
): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = error => reject(error);
	});