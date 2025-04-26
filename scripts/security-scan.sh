#!/bin/bash
# Security scanning script for Flash WhatsApp Service
# Performs dependency scanning, code analysis, and secret detection

set -e  # Exit on any error

# Display banner
echo "=================================================="
echo "      Flash WhatsApp Service - Security Scan      "
echo "=================================================="
echo ""

# Config
PROJECT_ROOT=$(pwd)
REPORT_DIR="${PROJECT_ROOT}/security-reports"
LOG_FILE="${REPORT_DIR}/security-scan-$(date +%Y%m%d-%H%M%S).log"
SEVERITY_THRESHOLD="high"  # Skip vulnerabilities below this threshold (low, medium, high, critical)

# Ensure reports directory exists
mkdir -p ${REPORT_DIR}

# Helper functions
function log_message() {
    echo "[$(date +%H:%M:%S)] $1"
    echo "[$(date +%H:%M:%S)] $1" >> ${LOG_FILE}
}

function run_section() {
    local section_name=$1
    local command=$2
    
    echo ""
    echo "=== Running ${section_name} ==="
    echo ""
    
    log_message "Starting ${section_name}"
    
    start_time=$(date +%s)
    
    if ${command}; then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        log_message "Completed ${section_name} successfully in ${duration}s"
        echo ""
        echo "✅ ${section_name} completed successfully in ${duration}s"
        echo ""
        return 0
    else
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        log_message "❌ ${section_name} failed after ${duration}s"
        echo ""
        echo "❌ ${section_name} failed after ${duration}s"
        echo ""
        return 1
    fi
}

# Record start time
TOTAL_START_TIME=$(date +%s)
log_message "Starting security scan"

# Step 1: Dependency scanning with npm audit
echo "Scanning dependencies for vulnerabilities..."
npm_audit_output="${REPORT_DIR}/npm-audit.json"

if npm audit --json > "${npm_audit_output}" 2>&1; then
    log_message "No vulnerabilities found by npm audit."
    echo "✅ No vulnerabilities found by npm audit."
else
    # Check if there are any vulnerabilities above our threshold
    if grep -q "\"severity\":\"${SEVERITY_THRESHOLD}\"" "${npm_audit_output}" || grep -q "\"severity\":\"critical\"" "${npm_audit_output}"; then
        log_message "❌ High or critical vulnerabilities found in dependencies!"
        echo "❌ High or critical vulnerabilities found in dependencies!"
        
        # Extract and display high/critical vulnerabilities
        echo "Summary of high/critical vulnerabilities:"
        echo "----------------------------------------"
        jq '.vulnerabilities | to_entries[] | select(.value.severity == "high" or .value.severity == "critical") | .value | { name: .name, severity: .severity, via: [.via[0].source // .via[0]], recommendation: .recommendation }' "${npm_audit_output}" || echo "Error parsing vulnerability report"
        echo ""
        
        security_issues=$((security_issues+1))
    else
        log_message "Only low/medium vulnerabilities found in dependencies."
        echo "⚠️ Only low/medium vulnerabilities found in dependencies."
    fi
fi

# Step 2: Code security analysis with ESLint security plugin
# Check if eslint-plugin-security is installed
if npm list eslint-plugin-security >/dev/null 2>&1; then
    echo "Running ESLint security analysis..."
    eslint_output="${REPORT_DIR}/eslint-security.txt"
    
    # Create a temporary ESLint config with security rules
    tmp_eslint_config="${REPORT_DIR}/.eslintrc-security.js"
    cat > "${tmp_eslint_config}" << EOF
module.exports = {
  extends: ['./.eslintrc.js', 'plugin:security/recommended'],
  plugins: ['security'],
};
EOF
    
    # Run ESLint with security rules
    if npx eslint --no-eslintrc -c "${tmp_eslint_config}" "src/**/*.ts" > "${eslint_output}" 2>&1; then
        log_message "✅ No security issues found by ESLint."
        echo "✅ No security issues found by ESLint."
    else
        log_message "❌ Security issues found by ESLint."
        echo "❌ Security issues found by ESLint. See ${eslint_output} for details."
        security_issues=$((security_issues+1))
    fi
    
    # Clean up temporary config
    rm "${tmp_eslint_config}"
else
    log_message "⚠️ eslint-plugin-security is not installed. Skipping code security analysis."
    echo "⚠️ eslint-plugin-security is not installed. Install it with: npm install eslint-plugin-security --save-dev"
fi

# Step 3: Secret detection
echo "Scanning for hardcoded secrets..."
secrets_output="${REPORT_DIR}/secrets-scan.txt"

# Simple grep-based secret detection
potential_secrets=$(grep -r -E "('|\")?(api|access|secret|key|token|password|auth|credential)('|\")?\s*(:|\s*=)\s*('|\")[A-Za-z0-9+/=]{16,}('|\")" --include="*.ts" --include="*.js" src/ || echo "")

if [ -z "$potential_secrets" ]; then
    log_message "✅ No potential hardcoded secrets found."
    echo "✅ No potential hardcoded secrets found."
else
    echo "$potential_secrets" > "${secrets_output}"
    log_message "❌ Potential hardcoded secrets found!"
    echo "❌ Potential hardcoded secrets found! See ${secrets_output} for details."
    security_issues=$((security_issues+1))
fi

# Step 4: Check for JWT security issues
echo "Checking for JWT security issues..."
jwt_issues=$(grep -r -E "jwt\.sign\(.*,\s*('|\")[A-Za-z0-9+/=]{8,}('|\")" --include="*.ts" --include="*.js" src/ || echo "")

if [ -z "$jwt_issues" ]; then
    log_message "✅ No hardcoded JWT secrets found."
    echo "✅ No hardcoded JWT secrets found."
else
    echo "$jwt_issues" > "${REPORT_DIR}/jwt-issues.txt"
    log_message "❌ Potential hardcoded JWT secrets found!"
    echo "❌ Potential hardcoded JWT secrets found! See ${REPORT_DIR}/jwt-issues.txt for details."
    security_issues=$((security_issues+1))
fi

# Step 5: Check for unsafe regex patterns (potential ReDoS)
echo "Checking for unsafe regex patterns..."
regex_issues=$(grep -r -E "new RegExp\(|RegExp\(|/(\\\\.)*\*+(\\\\.)*\*+/" --include="*.ts" --include="*.js" src/ || echo "")

if [ -z "$regex_issues" ]; then
    log_message "✅ No potentially unsafe regex patterns found."
    echo "✅ No potentially unsafe regex patterns found."
else
    echo "$regex_issues" > "${REPORT_DIR}/regex-issues.txt"
    log_message "⚠️ Potentially unsafe regex patterns found. Please review."
    echo "⚠️ Potentially unsafe regex patterns found. See ${REPORT_DIR}/regex-issues.txt for details."
    # Not counting as a security issue, just a warning
fi

# Step 6: Check for outdated packages
echo "Checking for outdated packages..."
npm outdated > "${REPORT_DIR}/outdated-packages.txt" || true

# Record end time and calculate duration
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))

# Format duration
function format_time() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local hours=$((minutes / 60))
    
    if [ $hours -gt 0 ]; then
        echo "${hours}h $((minutes % 60))m $((seconds % 60))s"
    elif [ $minutes -gt 0 ]; then
        echo "${minutes}m $((seconds % 60))s"
    else
        echo "${seconds}s"
    fi
}

FORMATTED_DURATION=$(format_time $TOTAL_DURATION)

# Generate summary
echo ""
echo "=================================================="
echo "              Security Scan Summary               "
echo "=================================================="
echo ""
echo "Total scan duration: ${FORMATTED_DURATION}"
echo "Log file: ${LOG_FILE}"
echo ""

if [ "${security_issues}" -gt "0" ]; then
    echo "⚠️  Scan completed with ${security_issues} security issues detected."
    log_message "Scan completed with ${security_issues} security issues detected."
    echo ""
    echo "Please review the reports in ${REPORT_DIR} directory."
    exit 1
else
    echo "✅ No major security issues detected!"
    log_message "No major security issues detected."
    exit 0
fi