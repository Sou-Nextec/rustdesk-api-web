<template>
  <div class="login-container">
    <div class="login-card">
      <img src="@/assets/logo.png" alt="logo" class="login-logo"/>

      <!-- entrada automática pelo login externo: o painel já está atrás do Cloudflare Access (Entra) -->
      <div v-if="autoStarting" class="sso-starting" role="status" aria-live="polite">
        <span class="sso-spinner" aria-hidden="true"></span>
        <p>Entrando com a sua conta Microsoft…</p>
        <el-button link class="sso-manual" @click="stopAuto">Entrar de outro jeito</el-button>
      </div>

      <el-form v-if="!autoStarting && !disablePwd" label-position="top" class="login-form">
        <el-form-item :label="T('Username')">
          <el-input v-model="form.username" type="username" class="login-input"></el-input>
        </el-form-item>

        <el-form-item :label="T('Password')">
          <el-input v-model="form.password" type="password" @keyup.enter.native="login" show-password
                    class="login-input"></el-input>
        </el-form-item>
        <el-form-item :label="T('Captcha')" v-if="captchaCode">
          <el-input v-model="form.captcha" @keyup.enter.native="login"  class="login-input captcha-input">
            <template #append>
              <img :src="captchaCode.b64" @click="loadCaptcha" class="captcha" alt="captcha"/>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button @click="login" type="primary" class="login-button">{{ T('Login') }}</el-button>
          <el-button v-if="allowRegister" @click="register" class="login-button">{{ T('Register') }}</el-button>
        </el-form-item>
      </el-form>

      <div class="divider" v-if="!autoStarting && options.length > 0 && !disablePwd">
        <span>{{ T('or login in with') }}</span>
      </div>

      <div v-if="!autoStarting" class="oidc-options">
        <div v-for="(option, index) in options" :key="index" class="oidc-option">
          <el-button @click="handleOIDCLogin(option.name)" class="oidc-btn">
            <img :src="getProviderImage(option.name)" alt="" class="oidc-icon"/>
            <span>{{ providerLabel(option.name, T) }}</span>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { reactive, onMounted, ref } from 'vue'
  import { useUserStore } from '@/store/user'
  import { ElMessage } from 'element-plus'
  import { T } from '@/utils/i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { loginOptions, captcha } from '@/api/login'
  import { getCode, removeCode } from '@/utils/auth'
  import { autoSsoProvider, markAttempt, markLoggedOut, clearLoggedOut, clearSsoFlags, providerLabel } from '@/nextec/auto-sso.mjs'

  const oauthInfo = ref({})
  const userStore = useUserStore()
  const route = useRoute()
  const router = useRouter()
  const options = reactive([]) // 存储 OIDC 登录选项
  const autoStarting = ref(false)

  let platform = window.navigator.platform
  if (navigator.platform.indexOf('Mac') === 0) {
    platform = 'mac'
  } else if (navigator.platform.indexOf('Win') === 0) {
    platform = 'windows'
  } else if (navigator.platform.indexOf('Linux armv') === 0) {
    platform = 'android'
  } else if (navigator.platform.indexOf('Linux') === 0) {
    platform = 'linux'
  }
  const userAgent = navigator.userAgent
  let browser = 'Unknown Browser'
  if (/chrome|crios/i.test(userAgent)) browser = 'Chrome'
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox'
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari'
  else if (/edg/i.test(userAgent)) browser = 'Edge'

  const form = reactive({
    username: '',
    password: '',
    platform: platform,
    captcha: '',
    captcha_id: ''
  })

  const captchaCode = ref('')
  const redirect = route.query?.redirect
  const login = async () => {
    const res = await userStore.login(form).catch(e => e)
    if (!res.code) {
      clearSsoFlags(sessionStorage)
      ElMessage.success(T('LoginSuccess'))
      router.push({ path: redirect || '/', replace: true })
      return
    }
    if (res.code === 110) {
      // need captcha
      loadCaptcha()
    } else {
      // o servidor passa a exigir captcha depois de N falhas, mas responde com código genérico;
      // consulta de novo para exibir o campo (senão o usuário fica sem como entrar)
      const opts = await loginOptions().catch(_ => false)
      if (opts?.data?.need_captcha) loadCaptcha()
    }
  }

  const loadCaptcha = async () => {
    const captchaRes = await captcha().catch(_ => false)
    console.log(captchaRes)
    captchaCode.value = captchaRes.data.captcha
    form.captcha_id = captchaRes.data.captcha.id
  }

  // fromAuto: aberto sozinho pela tela. Clicar no botão é uma escolha da pessoa: tira a marca de "saí de propósito", mas registra a
  // tentativa, para que um retorno com erro não dispare a entrada automática logo depois.
  const handleOIDCLogin = async (provider, fromAuto = false) => {
    if (!fromAuto) {
      clearLoggedOut(sessionStorage)
      markAttempt(sessionStorage)
    }
    // entrada automática cancelada enquanto a chamada estava pendente: o resultado é descartado, sem redirecionar
    return userStore.oidc(provider, platform, browser, () => !fromAuto || autoStarting.value)
  }
  const stopAuto = () => {
    autoStarting.value = false
    markLoggedOut(sessionStorage)
  }

  import googleImage from '@/assets/google.png'
  import githubImage from '@/assets/github.png'
  import oidcImage from '@/assets/oidc.png'
  import webauthImage from '@/assets/webauth.png'
  import defaultImage from '@/assets/oidc.png'
  import microsoftImage from '@/assets/microsoft.svg'

  const providerImageMap = {
    google: googleImage,
    github: githubImage,
    oidc: oidcImage,
    microsoft: microsoftImage,
    // WebAuth: webauthImage,
    default: defaultImage,
  }

  const getProviderImage = (provider) => {
    return providerImageMap[provider.toLowerCase()] || providerImageMap.default
  }

  const allowRegister = ref(false)
  const disablePwd = ref(false)
  const loadLoginOptions = async () => {
    try {
      const res = await loginOptions().catch(_ => false)
      if (!res || !res.data) return console.error('No valid response received')
      // a API devolve ops = null quando não há provedor (ou a consulta falha): trata como lista vazia
      const ops = res.data.ops || []
      ops.forEach(option => options.push({ name: option }))
      // um único provedor (a Microsoft): abre o fluxo sozinho, com as travas contra loop e contra reconexão após sair de propósito
      const auto = autoSsoProvider({ ops, query: route.query, storage: sessionStorage, now: Date.now() })
      if (auto) {
        // sem como gravar a trava contra loop, não redireciona sozinho (a pessoa clica)
        if (markAttempt(sessionStorage)) {
          autoStarting.value = true
          const started = await handleOIDCLogin(auto, true)
          if (!started) autoStarting.value = false
        }
      }
      disablePwd.value = res.data.disable_pwd
      allowRegister.value = res.data.register
      if (res.data.need_captcha) {
        loadCaptcha()
      }
    } catch (error) {
      console.error('Error loading login options:', error.message)
    }
  }

  onMounted(async () => {
    const code = getCode()
    if (code) {
      // 如果code存在，进行query获取user info
      const res = await userStore.query(code)
      if (res) {
        // 删除code，确保跳转之前对code进行清楚
        removeCode()
        clearSsoFlags(sessionStorage)
        ElMessage.success(T('LoginSuccess'))
        router.push({ path: redirect || '/', replace: true })
      } else {
        // a volta do login externo falhou: descarta o código velho e mostra a tela. Registra a hora da volta para a trava contra
        // loop contar daqui (um login que levou minutos, com senha ou MFA, não pode disparar outro redirecionamento na hora)
        removeCode()
        markAttempt(sessionStorage)
        loadLoginOptions()
      }
    } else {
      // 如果code不存在, 现实登陆页面
      loadLoginOptions() // 组件挂载后调用登录选项加载函数
    }
  })

  const register = () => {
    router.push('/register')
  }
</script>

<style scoped lang="scss">
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #2d3a4b;
  padding: 20px;
  box-sizing: border-box;
}

.login-card {
  width: 360px;
  background-color: #283342;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

h1 {
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: bold;
}

.login-form {
  margin-bottom: 20px;
}

.login-input {
  width: 100%;
  .captcha{
    cursor: pointer;
    width: 150px;
  }
}
.captcha-input{
  :deep(.el-input-group__append) {
    border-radius: 5px;
    padding: 0;
    overflow: hidden;
  }
}

.login-button {
  width: 100%;
  height: 40px;
  margin-bottom: 20px;
  margin-left: 0;
}

.divider {
  display: flex;
  align-items: center;
  margin: 20px 0;
  font-size: 14px;
  color: #888;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: #ddd;
  }

  &::before {
    margin-right: 10px;
  }

  &::after {
    margin-left: 10px;
  }
}

.oidc-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.oidc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 50px;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  color: black;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.oidc-icon {
  width: 24px;
  height: 24px;
  margin-right: 10px;
}

.sso-starting {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 18px 0 6px;
  color: #fff;
  text-align: center;

  p { margin: 0; font-size: 15px; }
}

.sso-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: sso-spin 0.9s linear infinite;
}

@keyframes sso-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .sso-spinner { animation: none; }
}

.login-logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  display: block;
}

.el-form-item {
  ::v-deep(.el-form-item__label) {
    color: #fff;
  }

  .el-input {
    ::v-deep(.el-input__wrapper) {
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: transparent;
    }

    ::v-deep(input) {
      color: #fff;
    }
  }
}
</style>