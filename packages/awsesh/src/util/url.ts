/**
 * URL Helper for AWS SSO URLs
 * Supports both standard AWS and China AWS regions
 */
export namespace URLHelper {
  const STANDARD_SSO_PATTERN = /^https:\/\/[\w-]+\.awsapps\.com\/start$/
  const CHINA_SSO_PATTERN = /^https:\/\/start\.[\w-]+\.home\.awsapps\.cn\/directory\/[\w-]+#?\/?$/
  
  /**
   * Check if a URL is a valid SSO URL (standard or China)
   */
  export function isValidSSOUrl(url: string): boolean {
    return STANDARD_SSO_PATTERN.test(url) || CHINA_SSO_PATTERN.test(url)
  }
  
  /**
   * Check if a URL is a China AWS SSO URL
   */
  export function isChinaSSOUrl(url: string): boolean {
    return CHINA_SSO_PATTERN.test(url)
  }
  
  /**
   * Extract company/directory name from SSO URL
   */
  export function extractCompanyName(url: string): string | null {
    // Standard: https://company.awsapps.com/start
    const standardMatch = url.match(/^https:\/\/([\w-]+)\.awsapps\.com\/start$/)
    if (standardMatch) {
      return standardMatch[1]
    }
    
    // China: https://start.cn-north-1.home.awsapps.cn/directory/company#/
    const chinaMatch = url.match(/\/directory\/([\w-]+)#?\/?$/)
    if (chinaMatch) {
      return chinaMatch[1]
    }
    
    return null
  }
  
  /**
   * Extract region from China SSO URL
   */
  export function extractChinaRegion(url: string): string | null {
    if (!isChinaSSOUrl(url)) return null
    
    const match = url.match(/^https:\/\/start\.([\w-]+)\.home\.awsapps\.cn\//)
    return match ? match[1] : null
  }
  
  /**
   * Build SSO URL from components
   */
  export function buildSSOUrl(
    companyName: string,
    isChina: boolean,
    region?: string
  ): string {
    if (isChina) {
      const chinaRegion = region || "cn-north-1"
      return `https://start.${chinaRegion}.home.awsapps.cn/directory/${companyName}#/`
    }
    
    return `https://${companyName}.awsapps.com/start`
  }
}
