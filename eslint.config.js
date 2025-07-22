import globals from 'globals';
import pluginJs from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es6,
                BABYLON: 'readonly',
            },
        },
    },
    pluginJs.configs.recommended,
    prettier,
    {
        rules: {
            'no-unused-vars': 'warn',
            'no-unused-private-class-members': 'off',
        },
    },
];
