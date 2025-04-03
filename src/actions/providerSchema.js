export const providerFormData = {
  name: '',
  email: '',
  address: '',
  country: '',
};



// export default actionResponse;

export async function submitProvider(prevState, formData) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    const rawData = {
      name: formData.get('name'),
      email: formData.get('email'),
      address: formData.get('address'),
      country: formData.get('country'),
    };

    // Validaciones JavaScript
    const errors = {};

    if (!rawData.name) {
      errors.name = ["Name is required"];
    }

    if (!rawData.email) {
      errors.email = ["Email is required"];
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawData.email)) {
      errors.email = ["Invalid email format"];
    }

    if (!rawData.address) {
      errors.address = ["Wallet address is required"];
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(rawData.address)) {
      errors.address = ["Invalid wallet address format"];
    }

    if (!rawData.country) {
        errors.country = ["Country is required"];
    }

    if (Object.keys(errors).length > 0) {
      return {
        ...actionResponse, // Utiliza la estructura importada
        success: false,
        message: 'Please fix the errors in the form',
        errors: errors,
      };
    }

    // Save providers' data to database
    console.log('You have registered as a provider:', rawData);

    return {
      ...actionResponse, // Utiliza la estructura importada
      success: true,
      message: 'Registration made successfully!',
    };
  } catch (error) {
    return {
      ...actionResponse, // Utiliza la estructura importada
      success: false,
      message: 'An unexpected error occurred',
    };
  }
}