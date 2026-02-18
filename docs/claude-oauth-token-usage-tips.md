Want to maximize the value from your Claude Pro/Max flat subscription? What if you could enjoy unlimited API-like requests while paying only your monthly subscription fee? This guide shows you how to extract OAuth tokens from your normal Claude Code CLI login using mitmproxy, giving you programmatic access to Claude's API capabilities without the complex implementation overhead.

TL;DR:

Use mitmproxy to capture OAuth tokens during normal Claude Code CLI authentication, then use those tokens for API calls. This gives you API-like behavior with your flat subscription benefits, plus automatic token refresh when access tokens expire.

#Why Extract API Keys from Your Subscription? 🤔
#The Subscription vs API Pricing Gap
Claude offers two main pricing models that serve different needs:

Claude Pro/Max Subscription:

✅ Flat monthly fee ($20-200/month)
✅ Unlimited usage within fair use limits
✅ Perfect for personal and development use
❌ Limited to Claude interface and Code CLI
Claude API:

✅ Programmatic access
✅ Pay-per-use pricing
✅ Perfect for production applications
❌ Can get expensive for development/testing
#The Best of Both Worlds
What if you could combine the benefits of both approaches? By extracting OAuth tokens from your normal subscription login, you can:

Pay only the flat subscription fee while getting API-like access
Automate repetitive tasks without manual intervention
Test and prototype before committing to API pricing
Enjoy unlimited requests within your subscription limits
Skip complex OAuth implementation with the mitmproxy approach
This approach is perfect for:

Personal automation and scripting
Development and testing environments
Quick prototyping before production
Learning Claude API capabilities
Integrating with personal tools
#Quick Setup: The mitmproxy Approach 🚀
#What is mitmproxy?
mitmproxy is a free and open-source interactive HTTPS proxy that allows you to intercept and inspect network traffic. In our case, we'll use it to capture the OAuth tokens that are exchanged during the normal Claude Code CLI authentication process.

Why this approach?

✅ No complex OAuth implementation required
✅ Works with your existing subscription
✅ One-time setup with token refresh capability
✅ Perfect for personal automation and development
#Step-by-Step Implementation 🛠️
#Step 1: Install and Configure mitmproxy
#Installation
macOS:

brew install mitmproxy
Linux:

sudo apt-get install mitmproxy
Windows: Download from mitmproxy.org and follow installation instructions.

#Start mitmproxy
# Start mitmproxy on port 8080
mitmproxy -p 8080
Figure 1
Figure: mitmproxy interface running and ready to capture traffic

#Step 2: Configure System for Proxy
Before we can capture traffic, we need to configure your terminal to use the proxy:

# Export proxy environment variables
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
export NODE_EXTRA_CA_CERTS=~/.mitmproxy/mitmproxy-ca-cert.pem
#Step 3: Authenticate with Claude Code CLI
With mitmproxy running in one terminal and your proxy configured in another:

# In a new terminal with proxy configured
claude login
This will:

Open your browser for OAuth authentication
Prompt you to sign in to your Anthropic account
Complete the normal OAuth flow with PKCE
Return you to the terminal with authentication success
#Step 4: Capture the OAuth Tokens
In your mitmproxy terminal, you'll see the network traffic. Look for:

OAuth Authorization Request: You'll see the request to claude.ai/oauth/authorize
Token Exchange: The key request to /api/oauth/token or similar endpoint
The token exchange response will contain your valuable tokens:

{
  "token_type": "Bearer",
  "access_token": "sk-ant-oat01-A...",
  "expires_in": 28800,
  "refresh_token": "sk-ant-ort01-B...",
  "scope": "user:inference user:profile",
  "organization": {
    "uuid": "020b923f-ba7d-4e3c-ac05-539f3539a249",
    "name": "Your Organization"
  },
  "account": {
    "uuid": "7e5763b7-eb15-46f3-b17f-7eeeb607ec33",
    "email_address": "your.email@example.com"
  }
}
Figure 1
Figure: OAuth token response captured in mitmproxy

Important: Save both the access_token and refresh_token immediately. The access token expires after 8 hours, but the refresh token allows you to get new access tokens indefinitely.

#Step 5: Use Your Tokens for API Calls
Now you can use your extracted tokens to make API calls just like with regular Claude API keys:

# Simple curl example
curl -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-ant-oat01-your-access-token-here" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello, Claude! Can you explain quantum computing in simple terms?"
      }
    ]
  }'
#Step 6: Refresh Expired Access Tokens
Access tokens expire after 8 hours. When you get a 401 error, use your refresh token to get a new access token:

# Refresh token example
curl -X POST https://console.anthropic.com/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "sk-ant-ort01-your-refresh-token-here",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
  }'
client_id being used here is the official client_id being used for Claude Code CLI. It might be changed if Claude Code got updated.

#For Developers: Programmatic OAuth with PKCE 📚
Want to build a production application? While the mitmproxy approach is perfect for personal automation and development, you might want a more programmatic solution for production applications.

#The PKCE Approach
PKCE (Proof Key for Code Exchange) is the standard OAuth extension for public clients that can't securely store secrets. It provides:

✅ Fully automated token exchange
✅ No manual intervention required
✅ Enhanced security with cryptographic challenges
✅ Production-ready implementation
✅ Perfect for web/mobile applications
#When to Use PKCE Instead
Choose PKCE for:

Production applications serving multiple users
Web applications with browser-based authentication
Mobile apps needing OAuth integration
SaaS platforms requiring user authorization
Applications needing automated, scalable token management
Choose mitmproxy for:

Personal automation and scripting
Development and testing
Quick prototyping
Learning Claude API capabilities
Single-user workflows
Note: PKCE implementation requires registering your application with Anthropic and handling the complete OAuth flow programmatically. This adds complexity but provides a fully automated solution suitable for production environments.

#Learn More
For comprehensive PKCE implementation guides, check out:

OAuth 2.0 for Browser-Based Apps
Anthropic's OAuth Documentation
RFC 7636 - PKCE Specification
#Security Considerations 🔒
#mitmproxy Security
#Understanding the Risks
mitmproxy acts as a man-in-the-middle: It intercepts and decrypts HTTPS traffic
Certificate installation: You need to trust mitmproxy's SSL certificate
Only use for this specific purpose: Don't leave mitmproxy running continuously
#Best Practices
# Only run mitmproxy when needed
mitmproxy -p 8080

# Use terminal-specific proxy settings
export https_proxy=http://localhost:8080 http_proxy=http://localhost:8080

# Clear proxy settings when done
unset https_proxy http_proxy

# Verify no proxy is set
echo $https_proxy  # Should be empty
#Token Refresh Security
#Secure Token Refresh
import requests
import json

def secure_refresh_token(refresh_token, client_id):
    """Securely refresh access token"""
    try:
        response = requests.post(
            'https://console.anthropic.com/api/oauth/token',
            json={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': client_id
            },
            timeout=10  # Prevent hanging requests
        )

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Refresh failed: {response.status_code}")

    except requests.RequestException as e:
        raise Exception(f"Network error during refresh: {e}")
#Token Validation
def validate_token_format(token):
    """Basic token format validation"""
    if not token or not isinstance(token, str):
        return False

    # Claude API tokens start with 'sk-ant-'
    if token.startswith('sk-ant-oat01-') or token.startswith('sk-ant-ort01-'):
        return True

    return False
#Usage Guidelines
#Do's
✅ Use for personal automation and development
✅ Store tokens securely with proper file permissions
✅ Use terminal-specific proxy settings
✅ Clear credentials and proxy settings when done
✅ Monitor your account for unusual activity
#Don'ts
❌ Share tokens with others
❌ Commit tokens to version control
❌ Use system-wide proxy settings continuously
❌ Leave mitmproxy running unattended
❌ Use for production applications with multiple users
#Real-World Use Cases 🌍
#1. Personal Automation Scripts
Automate repetitive tasks in your personal workflow:

#!/usr/bin/env python3
import os
import json
import requests

class PersonalClaudeHelper:
    def __init__(self):
        self.load_credentials()

    def load_credentials(self):
        with open(os.path.expanduser('~/.claude-credentials.json'), 'r') as f:
            self.creds = json.load(f)

    def summarize_email(self, email_text):
        """Quickly summarize long emails"""
        prompt = f"Please summarize this email in 3 bullet points:\n\n{email_text}"
        return self.call_claude(prompt)

    def debug_code_snippet(self, code, language):
        """Get help with debugging code"""
        prompt = f"Help me debug this {language} code:\n\n{code}\n\nWhat's wrong and how do I fix it?"
        return self.call_claude(prompt)

    def generate_bash_script(self, description):
        """Generate bash scripts from natural language"""
        prompt = f"Create a bash script that: {description}"
        return self.call_claude(prompt)

    def call_claude(self, prompt):
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.creds['access_token'],
            'anthropic-version': '2023-06-01'
        }

        data = {
            'model': 'claude-3-haiku-20240307',
            'max_tokens': 1000,
            'messages': [{'role': 'user', 'content': prompt}]
        }

        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=data
        )

        return response.json()['content'][0]['text']

# Usage examples
helper = PersonalClaudeHelper()

# Quick CLI tool
if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        task = sys.argv[1]
        if task == "debug":
            code = input("Paste code to debug: ")
            print(helper.debug_code_snippet(code, "python"))
        elif task == "script":
            desc = input("Describe the script you want: ")
            print(helper.generate_bash_script(desc))
#2. Development and Testing Environment
Test your applications before committing to API pricing:

# test_claude_integration.py
import os
import json
import requests

class ClaudeTestEnvironment:
    def __init__(self):
        self.credentials = self.load_test_credentials()

    def load_test_credentials(self):
        """Load credentials for testing only"""
        # Check if we're in testing environment
        if os.getenv('TESTING') != 'true':
            raise Exception("This should only run in testing environment")

        with open('~/.claude-credentials.json', 'r') as f:
            return json.load(f)

    def test_api_integration(self, test_cases):
        """Run test cases against Claude API"""
        results = []

        for test_name, prompt in test_cases.items():
            try:
                response = self.call_claude_api(prompt)
                results.append({
                    'test': test_name,
                    'status': 'passed',
                    'response_length': len(response['content'][0]['text'])
                })
            except Exception as e:
                results.append({
                    'test': test_name,
                    'status': 'failed',
                    'error': str(e)
                })

        return results

    def benchmark_performance(self, prompts):
        """Benchmark API performance"""
        import time

        results = []
        for prompt in prompts:
            start_time = time.time()
            response = self.call_claude_api(prompt)
            end_time = time.time()

            results.append({
                'prompt_length': len(prompt),
                'response_time': end_time - start_time,
                'response_length': len(response['content'][0]['text'])
            })

        return results

# Usage for development testing
if __name__ == '__main__':
    tester = ClaudeTestEnvironment()

    test_cases = {
        'simple_qa': "What is 2 + 2?",
        'code_generation': "Write a Python function to reverse a string",
        'text_analysis': "Analyze the sentiment of this text: 'I love this product!'"
    }

    results = tester.test_api_integration(test_cases)
    for result in results:
        print(f"{result['test']}: {result['status']}")
#3. Learning and Experimentation
Learn Claude API capabilities without paying per request:

# claude_learning_lab.py
import json
import os
import requests

class ClaudeLearningLab:
    def __init__(self):
        self.creds = self.load_credentials()

    def experiment_with_models(self):
        """Test different Claude models"""
        models = [
            'claude-3-haiku-20240307',
            'claude-3-sonnet-20240229',
            'claude-3-opus-20240229'
        ]

        prompt = "Explain machine learning in one paragraph"

        for model in models:
            try:
                response = self.call_claude(prompt, model=model)
                print(f"\n=== {model} ===")
                print(response['content'][0]['text'])
                print(f"Tokens used: {response['usage']['total_tokens']}")
            except Exception as e:
                print(f"Error with {model}: {e}")

    def test_prompt_engineering(self):
        """Experiment with different prompt styles"""
        base_task = "Write a Python function to sort a list"

        prompt_variations = [
            base_task,
            f"{base_task}. Include comments and error handling.",
            f"{base_task}. Make it efficient and explain your approach.",
            f"You are an expert Python programmer. {base_task}. Use best practices."
        ]

        for i, prompt in enumerate(prompt_variations):
            response = self.call_claude(prompt)
            print(f"\n=== Variation {i+1} ===")
            print(response['content'][0]['text'])

    def explore_capabilities(self):
        """Test different Claude capabilities"""
        capabilities = [
            ("Code generation", "Write a React component for a todo list"),
            ("Text analysis", "Analyze the tone of this product review"),
            ("Creative writing", "Write a short story about a robot learning to paint"),
            ("Math problem", "Solve this calculus problem: ∫(x² + 2x) dx"),
            ("Translation", "Translate 'Hello, how are you?' to Japanese")
        ]

        for capability, prompt in capabilities:
            response = self.call_claude(prompt)
            print(f"\n=== {capability} ===")
            print(response['content'][0]['text'][:200] + "...")

# Usage for learning
lab = ClaudeLearningLab()
lab.explore_capabilities()
#4. Quick Prototyping
Build prototypes before committing to production infrastructure:

# prototype_validator.py
class PrototypeValidator:
    def __init__(self):
        self.creds = self.load_credentials()

    def validate_business_idea(self, idea_description):
        """Get AI feedback on business ideas"""
        prompt = f"""
        Analyze this business idea for feasibility and potential:

        Idea: {idea_description}

        Please provide:
        1. Technical feasibility (1-10)
        2. Market potential (1-10)
        3. Key challenges
        4. Minimum viable product suggestion
        """

        return self.call_claude(prompt)

    def design_system_architecture(self, requirements):
        """Get help designing system architecture"""
        prompt = f"""
        Design a system architecture for these requirements:

        {requirements}

        Include:
        1. Recommended technologies
        2. Database design
        3. API structure
        4. Security considerations
        """

        return self.call_claude(prompt)

    def generate_project_plan(self, project_description):
        """Generate a project plan"""
        prompt = f"""
        Create a project plan for:

        {project_description}

        Include:
        1. Major milestones
        2. Estimated timeline
        3. Key dependencies
        4. Risk assessment
        """

        return self.call_claude(prompt)
#5. Data Processing Automation
Automate data analysis and processing tasks:

# data_processor.py
import pandas as pd

class DataProcessor:
    def __init__(self):
        self.creds = self.load_credentials()

    def analyze_csv_data(self, csv_path, analysis_type="summary"):
        """Use Claude to analyze CSV data"""
        df = pd.read_csv(csv_path)

        # Convert data to a readable format for Claude
        data_summary = f"""
        Dataset: {csv_path}
        Shape: {df.shape}
        Columns: {list(df.columns)}
        First few rows:
        {df.head().to_string()}
        """

        prompt = f"""
        Analyze this dataset:

        {data_summary}

        Please provide:
        1. Data quality assessment
        2. Key insights and patterns
        3. Recommendations for analysis
        4. Potential issues or outliers
        """

        return self.call_claude(prompt)

    def generate_data_visualization_code(self, data_description, chart_type):
        """Generate Python code for data visualization"""
        prompt = f"""
        Write Python code using matplotlib/seaborn to create a {chart_type} chart for:

        {data_description}

        Include:
        1. Data loading
        2. Chart creation
        3. Labels and formatting
        4. Saving the chart
        """

        return self.call_claude(prompt)
These use cases demonstrate how you can leverage your Claude subscription for API-like behavior in development, testing, and personal automation scenarios.

#Conclusion 🎉
Maximizing the value of your Claude Pro/Max subscription doesn't have to be complicated. By using mitmproxy to extract OAuth tokens during normal authentication, you can enjoy API-like flexibility while paying only your flat subscription fee.

#Key Benefits of This Approach
✅ Cost-Effective: Pay only the $20-30/month subscription fee instead of per-request API pricing ✅ Simple Setup: No complex OAuth implementation required - just run mitmproxy and login normally ✅ Unlimited Usage: Enjoy API access within your subscription's fair use limits ✅ Automatic Refresh: Use refresh tokens to maintain continuous access without repeated authentication ✅ Production-Ready Tokens: Get the same API tokens that the official Claude Code CLI uses

#Perfect Use Cases
This approach shines for:

Personal automation and scripting workflows
Development environments and testing
Quick prototyping before committing to API pricing
Learning and experimentation with Claude's capabilities
Internal tools and personal productivity applications
#When to Consider Alternatives
While this mitmproxy approach is excellent for individual use, consider these alternatives for different scenarios:

Production applications serving multiple users → Implement proper OAuth with PKCE
SaaS platforms needing user authorization → Use Anthropic's official OAuth flow
Enterprise applications requiring compliance → Follow official API documentation
#Getting Started
Ready to maximize your Claude subscription value?

Install mitmproxy: brew install mitmproxy (or equivalent for your system)
Run the proxy: mitmproxy -p 8080
Configure your terminal: export https_proxy=http://localhost:8080
Authenticate normally: claude login
Capture your tokens and start building!
#Security Reminder
Remember to treat your extracted tokens like any other API credentials:

Store them securely with proper file permissions
Never share them or commit them to version control
Use terminal-specific proxy settings only when needed
Monitor your account for any unusual activity
By following this approach, you can transform your Claude subscription from a simple chat interface into a powerful development platform, opening up endless possibilities for automation, integration, and innovation.

Happy coding, and enjoy your maximized Claude subscription! 🚀

This guide focuses on extracting API access from existing Claude subscriptions using mitmproxy for personal and development use. For production applications, consider implementing proper OAuth with PKCE for enhanced security and scalability.