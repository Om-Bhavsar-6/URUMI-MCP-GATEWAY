export function validateUpstreamUrl(urlString: string): { valid: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    const host = url.hostname.toLowerCase();

    // Check for loopback and link-local addresses
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.')
    ) {
      return { valid: false, reason: 'Loopback and localhost addresses are forbidden' };
    }

    // Check for cloud metadata services (AWS, GCP, Azure, OpenStack)
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.startsWith('169.254.')) {
      return { valid: false, reason: 'Cloud instance metadata endpoints are strictly forbidden' };
    }

    // Check for Kubernetes control plane API server
    if (
      host === 'kubernetes' ||
      host === 'kubernetes.default' ||
      host === 'kubernetes.default.svc' ||
      host === 'kubernetes.default.svc.cluster.local' ||
      host === '10.96.0.1'
    ) {
      return { valid: false, reason: 'Kubernetes control plane API endpoints cannot be registered as upstreams' };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `Malformed URL: ${err.message}` };
  }
}
