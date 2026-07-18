#include <stdio.h>

int main(void) {
    char line[202];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("0\n");
        return 0;
    }

    int words = 0;
    int inside_word = 0;

    /* TODO: recorre la linea hasta '\n' o '\0'.
       Actualiza inside_word segun veas espacios o caracteres de palabra.
       Suma una palabra solo cuando empieza una nueva secuencia sin espacios. */

    printf("%d\n", words);
    return 0;
}
