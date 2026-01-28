import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'

interface GoogleLoginButtonProps {
  onSuccess: (idToken: string) => void
  onError: (error: string) => void
}

export default function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
  const handleSuccess = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      onSuccess(credentialResponse.credential)
    } else {
      onError('No credential received from Google')
    }
  }

  const handleError = () => {
    onError('Google sign-in failed')
  }

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        theme="filled_black"
        size="large"
        width={300}
        text="continue_with"
        shape="rectangular"
      />
    </div>
  )
}
