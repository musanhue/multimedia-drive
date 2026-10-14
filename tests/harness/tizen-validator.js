// Tizen 4.0 Native Packaging (.wgt) and config.xml Validator
// Validates Samsung Smart TV manifest schema, privileges, and icon assets

class TizenValidator {
  /**
   * Validates config.xml contents against Samsung TV requirements
   */
  static validateConfigXml(xmlContent) {
    const errors = [];

    if (!xmlContent || typeof xmlContent !== 'string') {
      return { valid: false, errors: ['Manifest config.xml content is missing or empty'] };
    }

    // 1. Mandatory Namespaces
    if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/ns\/widgets["']/.test(xmlContent)) {
      errors.push('Missing W3C widget namespace: xmlns="http://www.w3.org/ns/widgets"');
    }
    if (!/xmlns:tizen\s*=\s*["']http:\/\/tizen\.org\/ns\/widgets["']/.test(xmlContent)) {
      errors.push('Missing Tizen namespace: xmlns:tizen="http://tizen.org/ns/widgets"');
    }

    // 2. Mandatory tv-samsung profile
    if (!/<tizen:profile[^>]*name\s*=\s*["']tv-samsung["']/.test(xmlContent)) {
      errors.push('Missing or invalid profile: Must declare <tizen:profile name="tv-samsung"/> for Samsung Smart TV');
    }

    // 3. Application element and package prefix (10 characters)
    const appMatch = xmlContent.match(/<tizen:application[^>]*package\s*=\s*["']([^"']+)["']/);
    if (!appMatch) {
      errors.push('Missing <tizen:application> tag with package attribute');
    } else {
      const pkg = appMatch[1];
      if (pkg.length !== 10) {
        errors.push(`Tizen package prefix '${pkg}' must be exactly 10 alphanumeric characters (found ${pkg.length})`);
      }
    }

    // 4. Required Privileges
    const hasInternet = /<tizen:privilege[^>]*name\s*=\s*["']http:\/\/tizen\.org\/privilege\/internet["']/.test(xmlContent);
    const hasTvInput = /<tizen:privilege[^>]*name\s*=\s*["']http:\/\/tizen\.org\/privilege\/tv\.inputdevice["']/.test(xmlContent);

    if (!hasInternet) {
      errors.push('Missing required privilege: http://tizen.org/privilege/internet');
    }
    if (!hasTvInput) {
      errors.push('Missing required privilege: http://tizen.org/privilege/tv.inputdevice');
    }

    // 5. Hardware key event setting
    if (!/<tizen:setting[^>]*hwkey-event\s*=\s*["']enable["']/.test(xmlContent)) {
      errors.push('Missing or disabled hwkey-event: <tizen:setting hwkey-event="enable"/> is required for Return and media keys');
    }

    // 6. Icon reference
    if (!/<icon[^>]*src\s*=\s*["']icon\.png["']/.test(xmlContent)) {
      errors.push('Missing <icon src="icon.png"/> tag');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates PNG buffer for 117x117 resolution
   */
  static validateIconBuffer(buffer) {
    if (!buffer || buffer.length < 8) {
      return { valid: false, error: 'Buffer is too small to be a valid PNG' };
    }

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!buffer.subarray(0, 8).equals(pngSignature)) {
      return { valid: false, error: 'Invalid PNG header signature' };
    }

    if (buffer.length < 24) {
      return { valid: false, error: 'Buffer is too small to read PNG dimensions' };
    }

    // IHDR chunk starts at byte 12 (width at bytes 16-19, height at bytes 20-23)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    if (width !== 117 || height !== 117) {
      return {
        valid: false,
        error: `Icon dimensions must be exactly 117x117 pixels (got ${width}x${height})`,
        width,
        height
      };
    }

    return { valid: true, width, height };
  }
}

module.exports = {
  TizenValidator
};
